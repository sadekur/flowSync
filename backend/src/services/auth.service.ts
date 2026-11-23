import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { User, type UserDocument } from "../models/User";
import { ApiError } from "../middleware/errorHandler";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import type { LoginInput, RegisterInput, ResetPasswordInput } from "../validators/auth.validators";
import { appUrl, env } from "../config/env";
import { AuthToken } from "../models/AuthToken";
import { isRateLimited } from "../utils/rateLimit";
import { sendMail } from "../utils/mailer";
import { passwordResetEmail, verifyEmailEmail } from "../utils/emails";
import type { AuthTokenPurpose } from "../models/AuthToken";
import { logger } from "../utils/logger";

// 12 everywhere real. The test suite registers a few users per test, and
// bcryptjs (pure JS) takes ~0.8 s per hash at 12, so NODE_ENV=test — set only
// by backend/tests/setup/env.ts — uses the minimum cost instead.
const PASSWORD_SALT_ROUNDS = env.NODE_ENV === "test" ? 4 : 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export interface AuthResult {
  user: UserDocument;
  tokens: AuthTokens;
}

function issueTokens(user: UserDocument): AuthTokens {
  return {
    accessToken: signAccessToken({ sub: user.id }),
    refreshToken: signRefreshToken({ sub: user.id, tokenVersion: user.tokenVersion }),
    csrfToken: crypto.randomBytes(32).toString("hex"),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new ApiError(409, "Email already in use");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
  const user = await User.create({ name: input.name, email: input.email, passwordHash });

  try {
    await sendVerificationEmail(user);
  } catch (err) {
    // The account is created either way; the banner's resend button is the
    // retry.
    logger.error("Verification email failed to send", err);
  }

  return { user, tokens: issueTokens(user) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select("+passwordHash");
  if (!user || !(await user.comparePassword(input.password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  return { user, tokens: issueTokens(user) };
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== (payload.tokenVersion ?? 0)) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  return { user, tokens: issueTokens(user) };
}

const RESET_TOKEN_TTL_MINUTES = 30;
// Per email address, checked before the user lookup so the 429 says nothing
// about whether an account exists.
const RESET_REQUEST_LIMIT = 3;
const RESET_REQUEST_WINDOW_SECONDS = 60 * 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a single-use token for `purpose` and returns the raw value to email.
 * One live token per user and purpose: a new one retires the previous one.
 */
async function issueEmailedToken(userId: UserDocument["_id"], purpose: AuthTokenPurpose, ttlMs: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await AuthToken.deleteMany({ user: userId, purpose });
  await AuthToken.create({ user: userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Atomically redeems a token (two racing requests can't both succeed). Returns its user id, or null. */
async function redeemEmailedToken(token: string, purpose: AuthTokenPurpose) {
  const doc = await AuthToken.findOneAndDelete({ tokenHash: hashToken(token), purpose, expiresAt: { $gt: new Date() } });
  return doc?.user ?? null;
}

/**
 * Emails a single-use reset link if an account exists. The caller answers the
 * same way either way. (Registration's 409 already reveals whether an email is
 * taken, so this doesn't try to hide the extra time a real send takes.)
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (await isRateLimited(`ratelimit:password-reset:${email}`, RESET_REQUEST_LIMIT, RESET_REQUEST_WINDOW_SECONDS)) {
    throw new ApiError(429, "Too many reset requests for this email. Try again in an hour.");
  }

  const user = await User.findOne({ email });
  if (!user) return;
  if (!appUrl) {
    logger.error("Password reset requested but no APP_URL is configured, so no link can be built");
    return;
  }

  const token = await issueEmailedToken(user._id, "password_reset", RESET_TOKEN_TTL_MINUTES * 60_000);

  // In the URL fragment, not the query: browsers never send a fragment to any
  // server, so the token stays out of request logs and Referer headers.
  const url = `${appUrl}/reset-password#token=${token}`;
  try {
    await sendMail(passwordResetEmail(user.email, user.name, url, RESET_TOKEN_TTL_MINUTES));
  } catch (err) {
    // Same answer to the caller as a success; the failure is for the logs.
    logger.error("Password reset email failed to send", err);
  }
}

/** Returns the id of the user whose password was reset. */
export async function resetPassword(input: ResetPasswordInput): Promise<string> {
  const userId = await redeemEmailedToken(input.token, "password_reset");
  if (!userId) {
    throw new ApiError(400, "This reset link is invalid or has expired. Request a new one.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
  // Bumping tokenVersion signs out every other session: their refresh tokens
  // stop working (access tokens still live out their ~15 min).
  const user = await User.findByIdAndUpdate(userId, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });
  if (!user) {
    throw new ApiError(400, "This reset link is invalid or has expired. Request a new one.");
  }
  // The link reached the inbox, which is all verification proves.
  await markEmailVerified(user._id);
  return user.id;
}

const VERIFY_TOKEN_TTL_HOURS = 24;
// Per user. Checked after "already verified", which only the account itself
// can see.
const VERIFY_RESEND_LIMIT = 3;
const VERIFY_RESEND_WINDOW_SECONDS = 60 * 60;

/** Emails a fresh verification link, retiring any earlier one. Throws if it can't be sent. */
async function sendVerificationEmail(user: UserDocument): Promise<void> {
  if (!appUrl) throw new Error("No APP_URL is configured, so no verification link can be built");
  const token = await issueEmailedToken(user._id, "email_verification", VERIFY_TOKEN_TTL_HOURS * 3_600_000);
  // In the fragment, as with reset links. The page also waits for a click
  // before redeeming it, so a mail scanner that opens (and even runs) the
  // link can't verify an address on its owner's behalf.
  const url = `${appUrl}/verify-email#token=${token}`;
  await sendMail(verifyEmailEmail(user.email, user.name, url, VERIFY_TOKEN_TTL_HOURS));
}

/** Sets emailVerifiedAt, keeping the first time if it's already set. */
async function markEmailVerified(userId: UserDocument["_id"]): Promise<void> {
  await User.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });
}

export async function resendVerificationEmail(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, "User no longer exists");
  if (user.emailVerifiedAt) throw new ApiError(400, "Your email is already verified.");
  if (await isRateLimited(`ratelimit:verify-email:${user.id}`, VERIFY_RESEND_LIMIT, VERIFY_RESEND_WINDOW_SECONDS)) {
    throw new ApiError(429, "Too many emails sent. Try again in an hour.");
  }

  try {
    await sendVerificationEmail(user);
  } catch (err) {
    logger.error("Verification email failed to send", err);
    throw new ApiError(503, "We couldn't send the email just now. Try again in a few minutes.");
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const userId = await redeemEmailedToken(token, "email_verification");
  if (!userId) {
    throw new ApiError(400, "This verification link is invalid or has expired. Log in to get a new one.");
  }
  await markEmailVerified(userId);
}

export async function getProfile(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }

  return user;
}

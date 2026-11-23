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
import { passwordResetEmail } from "../utils/emails";
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

  const token = crypto.randomBytes(32).toString("base64url");
  // One live link per user: a new request retires the previous one.
  await AuthToken.deleteMany({ user: user._id, purpose: "password_reset" });
  await AuthToken.create({
    user: user._id,
    purpose: "password_reset",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
  });

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
  // Atomic find-and-delete: two requests racing with the same link can't
  // both succeed.
  const resetToken = await AuthToken.findOneAndDelete({
    tokenHash: hashToken(input.token),
    purpose: "password_reset",
    expiresAt: { $gt: new Date() },
  });
  if (!resetToken) {
    throw new ApiError(400, "This reset link is invalid or has expired. Request a new one.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
  // Bumping tokenVersion signs out every other session: their refresh tokens
  // stop working (access tokens still live out their ~15 min).
  const user = await User.findByIdAndUpdate(resetToken.user, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });
  if (!user) {
    throw new ApiError(400, "This reset link is invalid or has expired. Request a new one.");
  }
  return user.id;
}

export async function getProfile(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }

  return user;
}

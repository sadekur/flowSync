import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { User, type UserDocument } from "../models/User";
import { ApiError } from "../middleware/errorHandler";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import type { LoginInput, RegisterInput } from "../validators/auth.validators";

const PASSWORD_SALT_ROUNDS = 12;

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

export async function getProfile(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, "User no longer exists");
  }

  return user;
}

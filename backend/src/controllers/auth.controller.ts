import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validators/auth.validators";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "../utils/cookies";
import { ApiError } from "../middleware/errorHandler";

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const { user, tokens } = await authService.register(input);

  setAuthCookies(res, tokens);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login(input);

  setAuthCookies(res, tokens);
  res.status(200).json({ user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    throw new ApiError(401, "No refresh token");
  }

  const { user, tokens } = await authService.refresh(token);

  setAuthCookies(res, tokens);
  res.status(200).json({ user });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearAuthCookies(res);
  res.status(204).send();
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  res.status(200).json({ message: "If an account exists for that email, a reset link is on its way." });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const input = resetPasswordSchema.parse(req.body);
  const userId = await authService.resetPassword(input);
  // Every session for that account was just invalidated. If this browser holds
  // one of them, drop its cookies too; a session for a *different* account
  // (someone resetting a password on a shared machine) is left alone.
  if (sessionUserId(req) === userId) clearAuthCookies(res);
  res.status(200).json({ message: "Password updated. Log in with your new password." });
}

/** Whose session this browser's cookies belong to, if any (access or refresh token). */
function sessionUserId(req: Request): string | undefined {
  const access = req.cookies?.[ACCESS_COOKIE];
  const refresh = req.cookies?.[REFRESH_COOKIE];
  try {
    if (access) return verifyAccessToken(access).sub;
  } catch {
    // Expired access token: fall through to the refresh token.
  }
  try {
    if (refresh) return verifyRefreshToken(refresh).sub;
  } catch {
    // No valid session.
  }
  return undefined;
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getProfile(req.userId as string);
  res.status(200).json({ user });
}

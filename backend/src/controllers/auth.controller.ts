import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { loginSchema, registerSchema } from "../validators/auth.validators";
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

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getProfile(req.userId as string);
  res.status(200).json({ user });
}

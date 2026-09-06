import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { ACCESS_COOKIE } from "../utils/cookies";
import { ApiError } from "./errorHandler";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE];

  if (!token) {
    next(new ApiError(401, "Not authenticated"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired access token"));
  }
}

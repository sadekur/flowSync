import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE } from "../utils/cookies";
import { ApiError } from "./errorHandler";

const CSRF_HEADER = "x-csrf-token";

/**
 * Double-submit CSRF check for cookie-authenticated, state-changing routes.
 * Not applied to /auth/register or /auth/login — no session (and no CSRF
 * cookie) exists yet for those to protect.
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(new ApiError(403, "Invalid or missing CSRF token"));
    return;
  }

  next();
}

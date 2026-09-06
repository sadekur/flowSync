import type { CookieOptions, Response } from "express";
import ms from "ms";
import { env, isProduction } from "../config/env";

export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";
// Deliberately NOT httpOnly — the client must be able to read it to echo it
// back in the X-CSRF-Token header (double-submit pattern, see middleware/csrf.ts).
export const CSRF_COOKIE = "csrfToken";

export interface AuthCookieValues {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    domain: env.COOKIE_DOMAIN,
    path: "/",
  };
}

export function setAuthCookies(res: Response, tokens: AuthCookieValues): void {
  const accessMaxAge = ms(env.JWT_ACCESS_EXPIRES_IN as ms.StringValue);
  const refreshMaxAge = ms(env.JWT_REFRESH_EXPIRES_IN as ms.StringValue);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...baseOptions(), maxAge: accessMaxAge });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...baseOptions(), maxAge: refreshMaxAge });
  res.cookie(CSRF_COOKIE, tokens.csrfToken, { ...baseOptions(), httpOnly: false, maxAge: refreshMaxAge });
}

export function clearAuthCookies(res: Response): void {
  const opts = baseOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
  res.clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false });
}

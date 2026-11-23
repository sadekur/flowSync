import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireCsrf } from "../middleware/csrf";
import * as authController from "../controllers/auth.controller";

export const authRouter = Router();

// No CSRF check on register/login: no session (and no CSRF cookie) exists
// yet for a forged cross-site request to ride along on.
authRouter.post("/auth/register", asyncHandler(authController.register));
authRouter.post("/auth/login", asyncHandler(authController.login));
// No session involved either: the reset link's token is the credential.
authRouter.post("/auth/forgot-password", asyncHandler(authController.forgotPassword));
authRouter.post("/auth/reset-password", asyncHandler(authController.resetPassword));

authRouter.post("/auth/refresh", requireCsrf, asyncHandler(authController.refresh));
authRouter.post("/auth/logout", requireCsrf, asyncHandler(authController.logout));

authRouter.get("/auth/me", requireAuth, asyncHandler(authController.me));

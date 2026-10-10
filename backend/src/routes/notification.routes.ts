import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireCsrf } from "../middleware/csrf";
import * as notificationController from "../controllers/notification.controller";

export const notificationRouter = Router();

// Reads are plain auth; marking read is state-changing, so it needs CSRF.
notificationRouter.get("/notifications", requireAuth, asyncHandler(notificationController.list));
notificationRouter.post(
  "/notifications/read",
  requireAuth,
  requireCsrf,
  asyncHandler(notificationController.markAllRead),
);

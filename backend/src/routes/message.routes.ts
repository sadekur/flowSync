import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { loadProject, loadWorkspace, requireWorkspaceMember } from "../middleware/membership";
import * as messageController from "../controllers/message.controller";

export const messageRouter = Router();

messageRouter.get(
  "/workspaces/:workspaceId/projects/:projectId/messages",
  requireAuth,
  asyncHandler(loadWorkspace),
  requireWorkspaceMember,
  asyncHandler(loadProject),
  asyncHandler(messageController.list),
);

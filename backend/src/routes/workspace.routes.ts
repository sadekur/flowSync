import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireCsrf } from "../middleware/csrf";
import { loadWorkspace, requireWorkspaceMember, requireWorkspaceOwner } from "../middleware/membership";
import * as workspaceController from "../controllers/workspace.controller";

export const workspaceRouter = Router();

workspaceRouter.use("/workspaces", requireAuth);

workspaceRouter.post("/workspaces", requireCsrf, asyncHandler(workspaceController.create));
workspaceRouter.get("/workspaces", asyncHandler(workspaceController.list));

workspaceRouter.get(
  "/workspaces/:workspaceId",
  asyncHandler(loadWorkspace),
  requireWorkspaceMember,
  asyncHandler(workspaceController.getOne),
);

workspaceRouter.patch(
  "/workspaces/:workspaceId",
  requireCsrf,
  asyncHandler(loadWorkspace),
  requireWorkspaceOwner,
  asyncHandler(workspaceController.update),
);

workspaceRouter.delete(
  "/workspaces/:workspaceId",
  requireCsrf,
  asyncHandler(loadWorkspace),
  requireWorkspaceOwner,
  asyncHandler(workspaceController.remove),
);

workspaceRouter.post(
  "/workspaces/:workspaceId/members",
  requireCsrf,
  asyncHandler(loadWorkspace),
  requireWorkspaceOwner,
  asyncHandler(workspaceController.addMember),
);

workspaceRouter.delete(
  "/workspaces/:workspaceId/members/:memberId",
  requireCsrf,
  asyncHandler(loadWorkspace),
  requireWorkspaceOwner,
  asyncHandler(workspaceController.removeMember),
);

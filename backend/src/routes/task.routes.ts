import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireCsrf } from "../middleware/csrf";
import { loadProject, loadTask, loadWorkspace, requireWorkspaceMember } from "../middleware/membership";
import * as taskController from "../controllers/task.controller";

export const taskRouter = Router();

const BASE = "/workspaces/:workspaceId/projects/:projectId/tasks";

// Prefix match — covers every route below, including /:taskId sub-paths.
taskRouter.use(
  BASE,
  requireAuth,
  asyncHandler(loadWorkspace),
  requireWorkspaceMember,
  asyncHandler(loadProject),
);

taskRouter.post(BASE, requireCsrf, asyncHandler(taskController.create));
taskRouter.get(BASE, asyncHandler(taskController.list));

taskRouter.get(`${BASE}/:taskId`, asyncHandler(loadTask), asyncHandler(taskController.getOne));

taskRouter.patch(
  `${BASE}/:taskId`,
  requireCsrf,
  asyncHandler(loadTask),
  asyncHandler(taskController.update),
);

taskRouter.delete(
  `${BASE}/:taskId`,
  requireCsrf,
  asyncHandler(loadTask),
  asyncHandler(taskController.remove),
);

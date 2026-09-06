import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireCsrf } from "../middleware/csrf";
import { loadProject, loadWorkspace, requireWorkspaceMember } from "../middleware/membership";
import * as projectController from "../controllers/project.controller";

export const projectRouter = Router();

const BASE = "/workspaces/:workspaceId/projects";

// Prefix match — covers every route below, including /:projectId sub-paths.
projectRouter.use(BASE, requireAuth, asyncHandler(loadWorkspace), requireWorkspaceMember);

projectRouter.post(BASE, requireCsrf, asyncHandler(projectController.create));
projectRouter.get(BASE, asyncHandler(projectController.list));

projectRouter.get(`${BASE}/:projectId`, asyncHandler(loadProject), asyncHandler(projectController.getOne));

projectRouter.patch(
  `${BASE}/:projectId`,
  requireCsrf,
  asyncHandler(loadProject),
  asyncHandler(projectController.update),
);

projectRouter.delete(
  `${BASE}/:projectId`,
  requireCsrf,
  asyncHandler(loadProject),
  asyncHandler(projectController.remove),
);

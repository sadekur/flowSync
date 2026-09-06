import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { Workspace } from "../models/Workspace";
import { Project } from "../models/Project";
import { Task } from "../models/Task";
import { ApiError } from "./errorHandler";

function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

// Workspace/Project URL params can be either the Mongo _id or the slug
// (see utils/slug.ts) — whichever the frontend linked to.
function idOrSlugFilter(param: unknown): Record<string, unknown> | null {
  if (typeof param !== "string" || param.length === 0) return null;
  return isValidObjectId(param) ? { _id: param } : { slug: param };
}

export async function loadWorkspace(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const filter = idOrSlugFilter(req.params.workspaceId);
  if (!filter) {
    next(new ApiError(404, "Workspace not found"));
    return;
  }

  const workspace = await Workspace.findOne(filter);
  if (!workspace) {
    next(new ApiError(404, "Workspace not found"));
    return;
  }

  req.workspace = workspace;
  next();
}

export function requireWorkspaceMember(req: Request, _res: Response, next: NextFunction): void {
  const isMember = req.workspace!.members.some((m) => m.toString() === req.userId);

  if (!isMember) {
    next(new ApiError(403, "Not a member of this workspace"));
    return;
  }

  next();
}

export function requireWorkspaceOwner(req: Request, _res: Response, next: NextFunction): void {
  if (req.workspace!.owner.toString() !== req.userId) {
    next(new ApiError(403, "Only the workspace owner can do this"));
    return;
  }

  next();
}

export async function loadProject(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const { projectId } = req.params;
  if (!isValidObjectId(projectId)) {
    next(new ApiError(404, "Project not found"));
    return;
  }

  const project = await Project.findOne({ _id: projectId, workspace: req.workspace!._id });
  if (!project) {
    next(new ApiError(404, "Project not found"));
    return;
  }

  req.project = project;
  next();
}

export async function loadTask(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const { taskId } = req.params;
  if (!isValidObjectId(taskId)) {
    next(new ApiError(404, "Task not found"));
    return;
  }

  const task = await Task.findOne({ _id: taskId, project: req.project!._id });
  if (!task) {
    next(new ApiError(404, "Task not found"));
    return;
  }

  req.task = task;
  next();
}

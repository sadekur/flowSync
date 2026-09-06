import "express";
import type { WorkspaceDocument } from "../models/Workspace";
import type { ProjectDocument } from "../models/Project";
import type { TaskDocument } from "../models/Task";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      workspace?: WorkspaceDocument;
      project?: ProjectDocument;
      task?: TaskDocument;
    }
  }
}

export {};

import { Project, type ProjectDocument } from "../models/Project";
import { Task } from "../models/Task";
import { Message } from "../models/Message";
import { Notification } from "../models/Notification";
import type { WorkspaceDocument } from "../models/Workspace";
import { generateUniqueSlug } from "../utils/slug";
import type { CreateProjectInput, UpdateProjectInput } from "../validators/project.validators";

export async function createProject(
  workspace: WorkspaceDocument,
  createdBy: string,
  input: CreateProjectInput,
): Promise<ProjectDocument> {
  const slug = await generateUniqueSlug(input.name, async (candidate) => {
    const existing = await Project.exists({ workspace: workspace._id, slug: candidate });
    return existing !== null;
  });

  return Project.create({
    workspace: workspace._id,
    slug,
    name: input.name,
    description: input.description,
    createdBy,
  });
}

export async function listProjects(workspace: WorkspaceDocument): Promise<ProjectDocument[]> {
  return Project.find({ workspace: workspace._id }).sort({ createdAt: -1 });
}

export async function updateProject(project: ProjectDocument, input: UpdateProjectInput): Promise<ProjectDocument> {
  if (input.name !== undefined) project.name = input.name;
  if (input.description !== undefined) project.description = input.description;
  await project.save();
  return project;
}

/** The project's workspace id, or null if it doesn't exist. Cached. */
export async function getProjectWorkspaceId(projectId: string): Promise<string | null> {
  return cacheAside(cacheKeys.projectWorkspace(projectId), PROJECT_WORKSPACE_TTL_SECONDS, async () => {
    const project = await Project.findById(projectId).select("workspace").lean<{ workspace: Types.ObjectId }>();
    return project ? project.workspace.toString() : null;
  });
}

export async function deleteProject(project: ProjectDocument): Promise<void> {
  await Task.deleteMany({ project: project._id });
  await Message.deleteMany({ project: project._id });
  await Notification.deleteMany({ project: project._id });
  await project.deleteOne();
  await invalidateCache(cacheKeys.projectWorkspace(project.id));
}

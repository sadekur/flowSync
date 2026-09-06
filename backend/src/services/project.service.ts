import { Project, type ProjectDocument } from "../models/Project";
import { Task } from "../models/Task";
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

export async function deleteProject(project: ProjectDocument): Promise<void> {
  await Task.deleteMany({ project: project._id });
  await project.deleteOne();
}

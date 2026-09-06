import { Workspace, type WorkspaceDocument } from "../models/Workspace";
import { Project } from "../models/Project";
import { Task } from "../models/Task";
import { User } from "../models/User";
import { ApiError } from "../middleware/errorHandler";
import type { AddMemberInput, CreateWorkspaceInput, UpdateWorkspaceInput } from "../validators/workspace.validators";

export async function createWorkspace(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceDocument> {
  return Workspace.create({ name: input.name, owner: ownerId, members: [ownerId] });
}

export async function listWorkspacesForUser(userId: string): Promise<WorkspaceDocument[]> {
  return Workspace.find({ members: userId }).sort({ createdAt: -1 });
}

export async function updateWorkspace(
  workspace: WorkspaceDocument,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceDocument> {
  workspace.name = input.name;
  await workspace.save();
  return workspace;
}

export async function deleteWorkspace(workspace: WorkspaceDocument): Promise<void> {
  const projectIds = await Project.find({ workspace: workspace._id }).distinct("_id");
  await Task.deleteMany({ project: { $in: projectIds } });
  await Project.deleteMany({ workspace: workspace._id });
  await workspace.deleteOne();
}

export async function addMember(workspace: WorkspaceDocument, input: AddMemberInput): Promise<WorkspaceDocument> {
  const user = await User.findOne({ email: input.email });
  if (!user) {
    throw new ApiError(404, "No user with that email");
  }

  const alreadyMember = workspace.members.some((m) => m.toString() === user.id);
  if (alreadyMember) {
    throw new ApiError(409, "User is already a member");
  }

  workspace.members.push(user._id);
  await workspace.save();
  return workspace;
}

export async function removeMember(workspace: WorkspaceDocument, memberId: string): Promise<WorkspaceDocument> {
  if (workspace.owner.toString() === memberId) {
    throw new ApiError(400, "Cannot remove the workspace owner");
  }

  const remaining = workspace.members.filter((m) => m.toString() !== memberId);
  workspace.members.splice(0, workspace.members.length, ...remaining);
  await workspace.save();
  return workspace;
}

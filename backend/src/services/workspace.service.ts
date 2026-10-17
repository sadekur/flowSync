import type { Types } from "mongoose";
import { Workspace, type WorkspaceDocument } from "../models/Workspace";
import { Project } from "../models/Project";
import { Task } from "../models/Task";
import { Message } from "../models/Message";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { ApiError } from "../middleware/errorHandler";
import { generateUniqueSlug } from "../utils/slug";
import { cacheAside, cacheKeys, invalidateCache } from "../utils/cache";
import type { AddMemberInput, CreateWorkspaceInput, UpdateWorkspaceInput } from "../validators/workspace.validators";

// Membership gates socket writes, so its TTL is short: it bounds how long a
// missed invalidation (Redis hiccup, read/write race) could let a removed
// member keep posting. The list only feeds the dashboard, so it can live longer.
const MEMBERS_TTL_SECONDS = 60;
const LIST_TTL_SECONDS = 5 * 60;

// One item of GET /api/workspaces — the same JSON the Mongoose doc's toJSON
// produced, built explicitly so it round-trips through the Redis cache.
export interface WorkspaceSummary {
  _id: string;
  name: string;
  slug: string;
  owner: string;
  members: string[];
  createdAt: string;
  updatedAt: string;
}

interface LeanWorkspace {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  owner: Types.ObjectId;
  members: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(w: LeanWorkspace): WorkspaceSummary {
  return {
    _id: w._id.toString(),
    name: w.name,
    slug: w.slug,
    owner: w.owner.toString(),
    members: w.members.map((m) => m.toString()),
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

/**
 * Drops everything cached about a workspace after a write: its member list,
 * and the workspace list of every user who could see it. `extraUserIds`
 * covers people who are no longer in `workspace.members` (a removed member
 * still has the workspace in their cached list).
 */
async function invalidateWorkspace(workspace: WorkspaceDocument, extraUserIds: string[] = []): Promise<void> {
  const userIds = new Set([...workspace.members.map((m) => m.toString()), ...extraUserIds]);
  await invalidateCache(
    cacheKeys.workspaceMembers(workspace.id),
    ...[...userIds].map((id) => cacheKeys.userWorkspaces(id)),
  );
}

export async function createWorkspace(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceDocument> {
  const slug = await generateUniqueSlug(input.name, async (candidate) => {
    const existing = await Workspace.exists({ slug: candidate });
    return existing !== null;
  });

  const workspace = await Workspace.create({ name: input.name, slug, owner: ownerId, members: [ownerId] });
  await invalidateCache(cacheKeys.userWorkspaces(ownerId));
  return workspace;
}

export async function listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  const workspaces = await cacheAside(cacheKeys.userWorkspaces(userId), LIST_TTL_SECONDS, async () => {
    const docs = await Workspace.find({ members: userId }).sort({ createdAt: -1 }).lean<LeanWorkspace[]>();
    return docs.map(toSummary);
  });
  return workspaces ?? [];
}

/** The workspace's member ids, or null if it doesn't exist. Cached. */
export async function getWorkspaceMemberIds(workspaceId: string): Promise<string[] | null> {
  return cacheAside(cacheKeys.workspaceMembers(workspaceId), MEMBERS_TTL_SECONDS, async () => {
    const workspace = await Workspace.findById(workspaceId).select("members").lean<{ members: Types.ObjectId[] }>();
    return workspace ? workspace.members.map((m) => m.toString()) : null;
  });
}

export async function updateWorkspace(
  workspace: WorkspaceDocument,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceDocument> {
  workspace.name = input.name;
  await workspace.save();
  await invalidateWorkspace(workspace);
  return workspace;
}

export async function deleteWorkspace(workspace: WorkspaceDocument): Promise<void> {
  const projectIds = await Project.find({ workspace: workspace._id }).distinct("_id");
  await Task.deleteMany({ project: { $in: projectIds } });
  await Message.deleteMany({ workspace: workspace._id });
  await Notification.deleteMany({ workspace: workspace._id });
  await Project.deleteMany({ workspace: workspace._id });
  await workspace.deleteOne();
  await invalidateWorkspace(workspace);
  await invalidateCache(...projectIds.map((id) => cacheKeys.projectWorkspace(id.toString())));
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
  await invalidateWorkspace(workspace);
  return workspace;
}

export async function removeMember(workspace: WorkspaceDocument, memberId: string): Promise<WorkspaceDocument> {
  if (workspace.owner.toString() === memberId) {
    throw new ApiError(400, "Cannot remove the workspace owner");
  }

  const remaining = workspace.members.filter((m) => m.toString() !== memberId);
  workspace.members.splice(0, workspace.members.length, ...remaining);
  await workspace.save();
  await invalidateWorkspace(workspace, [memberId]);
  return workspace;
}

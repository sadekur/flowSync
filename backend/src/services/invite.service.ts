import { Types } from "mongoose";
import { User, type UserDocument } from "../models/User";
import { WorkspaceInvite } from "../models/WorkspaceInvite";
import type { WorkspaceDocument } from "../models/Workspace";
import { ApiError } from "../middleware/errorHandler";
import { appUrl } from "../config/env";
import { isRateLimited } from "../utils/rateLimit";
import { sendMail } from "../utils/mailer";
import { addedToWorkspaceEmail, workspaceInviteEmail } from "../utils/emails";
import { generateEmailedToken, hashToken } from "../utils/tokens";
import { logger } from "../utils/logger";
import { addUserToWorkspace } from "./workspace.service";

const INVITE_TTL_DAYS = 7;
// Per owner, across every workspace they own. Each add or invite sends an
// email from FlowSync's one sender address, so this caps how far an account
// could use it to spam strangers (Brevo's free plan allows 300 a day).
const ADD_LIMIT = 20;
const ADD_WINDOW_SECONDS = 60 * 60;

const INVALID_INVITE = "This invite link is invalid or has expired. Ask the workspace owner for a new one.";

/** A pending invite, as the workspace owner sees it. */
export interface InviteDto {
  _id: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

/** What the invite page shows to whoever holds the link. */
export interface InvitePreview {
  email: string;
  workspaceName: string;
  invitedByName: string;
  expiresAt: string;
}

export interface JoinedWorkspace {
  _id: string;
  name: string;
  slug: string;
}

export type AddOrInviteResult =
  | { kind: "added"; workspace: WorkspaceDocument }
  | { kind: "invited"; invite: InviteDto };

function toInviteDto(invite: {
  _id: Types.ObjectId;
  email: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}): InviteDto {
  return {
    _id: invite._id.toString(),
    email: invite.email,
    invitedBy: invite.invitedBy.toString(),
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

/**
 * The owner's "add member" action. A verified account is added at once and
 * told by email. Anyone else gets an invite link: a new person, or an
 * unverified account, which may have been registered by someone who doesn't
 * own the address. The link only reaches the real inbox, so only its owner
 * can accept it.
 */
export async function addOrInvite(
  workspace: WorkspaceDocument,
  inviterId: string,
  email: string,
): Promise<AddOrInviteResult> {
  const user = await User.findOne({ email });
  if (user && workspace.members.some((m) => m.toString() === user.id)) {
    throw new ApiError(409, "User is already a member");
  }
  if (await isRateLimited(`ratelimit:workspace-add:${inviterId}`, ADD_LIMIT, ADD_WINDOW_SECONDS)) {
    throw new ApiError(429, "Too many members added or invited. Try again in an hour.");
  }
  const inviter = await User.findById(inviterId);
  if (!inviter) throw new ApiError(401, "User no longer exists");

  if (user?.emailVerifiedAt) {
    const updated = await addUserToWorkspace(workspace.id, user.id);
    if (!updated) throw new ApiError(404, "Workspace not found");
    // Any pending invite for them is moot now.
    await WorkspaceInvite.deleteMany({ workspace: workspace._id, email });
    await notifyAdded(user, inviter, updated);
    return { kind: "added", workspace: updated };
  }

  return { kind: "invited", invite: await sendInvite(workspace, inviter, email) };
}

/** Best effort: the member is in either way, so a failed send is only logged. */
async function notifyAdded(user: UserDocument, inviter: UserDocument, workspace: WorkspaceDocument): Promise<void> {
  if (!appUrl) {
    logger.error("A member was added but no APP_URL is configured, so no email was sent");
    return;
  }
  try {
    await sendMail(addedToWorkspaceEmail(user.email, user.name, inviter.name, workspace.name, `${appUrl}/dashboard`));
  } catch (err) {
    logger.error("'Added to workspace' email failed to send", err);
  }
}

/** Creates or renews the email's invite and mails it. Throws 503 if it can't be sent. */
async function sendInvite(workspace: WorkspaceDocument, inviter: UserDocument, email: string): Promise<InviteDto> {
  if (!appUrl) {
    logger.error("An invite was requested but no APP_URL is configured, so no link can be built");
    throw new ApiError(503, "We couldn't send the invite just now. Try again in a few minutes.");
  }

  const token = generateEmailedToken();
  // Inviting the same email again replaces its token, so the earlier link
  // stops working and only the newest email can be used.
  const invite = await WorkspaceInvite.findOneAndUpdate(
    { workspace: workspace._id, email },
    {
      $set: {
        invitedBy: inviter._id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  // In the fragment, like reset and verification links: it never reaches a
  // server log or a Referer header.
  const url = `${appUrl}/invite#token=${token}`;
  try {
    await sendMail(workspaceInviteEmail(email, inviter.name, workspace.name, url, INVITE_TTL_DAYS));
  } catch (err) {
    // An invite nobody received would show as pending with no way to use it.
    await WorkspaceInvite.deleteOne({ _id: invite._id });
    logger.error("Invite email failed to send", err);
    throw new ApiError(503, "We couldn't send the invite just now. Try again in a few minutes.");
  }
  return toInviteDto(invite);
}

export async function listInvites(workspaceId: string): Promise<InviteDto[]> {
  const invites = await WorkspaceInvite.find({ workspace: workspaceId, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();
  return invites.map(toInviteDto);
}

export async function cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
  if (!Types.ObjectId.isValid(inviteId)) throw new ApiError(404, "Invite not found");
  const { deletedCount } = await WorkspaceInvite.deleteOne({ _id: inviteId, workspace: workspaceId });
  if (deletedCount === 0) throw new ApiError(404, "Invite not found");
}

async function findLiveInvite(token: string) {
  return WorkspaceInvite.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
    .populate<{ workspace: { _id: Types.ObjectId; name: string; slug: string } | null }>("workspace", "name slug")
    .populate<{ invitedBy: { name: string } | null }>("invitedBy", "name");
}

/** For the invite page. Read-only, so a mail scanner opening the link changes nothing. */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const invite = await findLiveInvite(token);
  if (!invite?.workspace) throw new ApiError(400, INVALID_INVITE);
  return {
    email: invite.email,
    workspaceName: invite.workspace.name,
    invitedByName: invite.invitedBy?.name ?? "Someone",
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/**
 * Joins the invite's workspace as `userId`, whose account must have the
 * invited email: holding the link alone isn't enough, so a forwarded or
 * leaked link can't let a different account in. The token can only have come
 * from that inbox, so this also verifies the address.
 */
export async function acceptInvite(token: string, userId: string): Promise<JoinedWorkspace> {
  const invite = await findLiveInvite(token);
  if (!invite?.workspace) throw new ApiError(400, INVALID_INVITE);

  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, "User no longer exists");
  if (user.email !== invite.email) {
    throw new ApiError(403, `This invite is for ${invite.email}. Log in with that account to accept it.`);
  }

  // Atomic, so the same link can't be redeemed twice by racing requests.
  const redeemed = await WorkspaceInvite.findOneAndDelete({ _id: invite._id, tokenHash: invite.tokenHash });
  if (!redeemed) throw new ApiError(400, INVALID_INVITE);

  const workspace = await addUserToWorkspace(invite.workspace._id.toString(), user.id);
  if (!workspace) throw new ApiError(400, INVALID_INVITE);
  await User.updateOne({ _id: user._id, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });

  return { _id: workspace.id, name: workspace.name, slug: workspace.slug };
}

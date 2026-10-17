import { Types } from "mongoose";
import { Notification, type NotificationType } from "../models/Notification";
import { Workspace } from "../models/Workspace";
import type { ProjectDocument } from "../models/Project";
import type { TaskDocument } from "../models/Task";
import type { MessageDto } from "./message.service";
import { emitNotification } from "../sockets/emitter";

// The one wire shape for a notification, used by both GET /api/notifications
// and the `notification:new` socket event. Built explicitly so only the
// actor's name (never email etc.) can leak to the recipient.
export interface NotificationDto {
  _id: string;
  type: NotificationType;
  read: boolean;
  actor: { _id: string; name: string } | null;
  workspace: string;
  project: string;
  task?: string;
  message?: string;
  preview: string;
  createdAt: string;
}

interface PopulatedNotification {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  type: NotificationType;
  read: boolean;
  actor: { _id: Types.ObjectId; name: string } | null;
  workspace: Types.ObjectId;
  project: Types.ObjectId;
  task?: Types.ObjectId;
  message?: Types.ObjectId;
  preview: string;
  createdAt: Date;
}

function toDto(n: PopulatedNotification): NotificationDto {
  return {
    _id: n._id.toString(),
    type: n.type,
    read: n.read,
    actor: n.actor ? { _id: n.actor._id.toString(), name: n.actor.name } : null,
    workspace: n.workspace.toString(),
    project: n.project.toString(),
    ...(n.task ? { task: n.task.toString() } : {}),
    ...(n.message ? { message: n.message.toString() } : {}),
    preview: n.preview,
    createdAt: n.createdAt.toISOString(),
  };
}

const ACTOR_POPULATE = { path: "actor", select: "name" } as const;

/** Persists one notification and pushes it to the recipient's sockets. */
async function createAndEmit(input: {
  recipient: Types.ObjectId;
  actor: string;
  type: NotificationType;
  workspace: Types.ObjectId;
  project: Types.ObjectId;
  task?: Types.ObjectId;
  message?: Types.ObjectId;
  preview: string;
}): Promise<void> {
  const created = await Notification.create(input);
  const doc = await Notification.findById(created._id)
    .populate<{ actor: PopulatedNotification["actor"] }>(ACTOR_POPULATE)
    .lean<PopulatedNotification>()
    .orFail();
  emitNotification(doc.recipient.toString(), toDto(doc));
}

/** Notifies the assignee that a task was assigned to them. No-op if there is no
 *  assignee or the actor assigned it to themselves. */
export async function notifyTaskAssigned(
  project: ProjectDocument,
  task: TaskDocument,
  actorId: string,
): Promise<void> {
  await notifyAssignee(project, task, actorId, "task_assigned");
}

/** Notifies the assignee that a task assigned to them changed. A changed
 *  assignee reads as a fresh assignment; otherwise it's an update. */
export async function notifyTaskUpdated(
  project: ProjectDocument,
  task: TaskDocument,
  actorId: string,
  previousAssignee: string | undefined,
): Promise<void> {
  const assignee = task.assignee?.toString();
  if (!assignee) return;
  await notifyAssignee(project, task, actorId, previousAssignee === assignee ? "task_updated" : "task_assigned");
}

async function notifyAssignee(
  project: ProjectDocument,
  task: TaskDocument,
  actorId: string,
  type: NotificationType,
): Promise<void> {
  const assignee = task.assignee?.toString();
  if (!assignee || assignee === actorId) return;
  await createAndEmit({
    recipient: task.assignee as Types.ObjectId,
    actor: actorId,
    type,
    workspace: project.workspace,
    project: project._id,
    task: task._id,
    preview: task.title,
  });
}

/** Notifies every workspace member except the sender that a message was posted. */
export async function notifyNewMessage(project: ProjectRef, message: MessageDto, senderId: string): Promise<void> {
  // Same cached member list the send's membership check just read.
  const members = await getWorkspaceMemberIds(project.workspace);
  if (!members) return;

  const recipients = members.filter((member) => member !== senderId);
  if (recipients.length === 0) return;

  const preview = message.text.length > 120 ? `${message.text.slice(0, 120)}…` : message.text;
  const created = await Notification.insertMany(
    recipients.map((recipient) => ({
      recipient: new Types.ObjectId(recipient),
      actor: new Types.ObjectId(senderId),
      type: "message" as const,
      workspace: new Types.ObjectId(project.workspace),
      project: new Types.ObjectId(project._id),
      message: new Types.ObjectId(message._id),
      preview,
    })),
  );

  const docs = await Notification.find({ _id: { $in: created.map((doc) => doc._id) } })
    .populate<{ actor: PopulatedNotification["actor"] }>(ACTOR_POPULATE)
    .lean<PopulatedNotification[]>();

  for (const doc of docs) emitNotification(doc.recipient.toString(), toDto(doc));
}

/** The recipient's newest 50 notifications, plus their true unread count. */
export async function listNotifications(
  userId: string,
): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
  const [docs, unreadCount] = await Promise.all([
    Notification.find({ recipient: userId })
      .sort({ _id: -1 })
      .limit(50)
      .populate<{ actor: PopulatedNotification["actor"] }>(ACTOR_POPULATE)
      .lean<PopulatedNotification[]>(),
    Notification.countDocuments({ recipient: userId, read: false }),
  ]);

  return { notifications: docs.map(toDto), unreadCount };
}

export async function markAllRead(userId: string): Promise<void> {
  await Notification.updateMany({ recipient: userId, read: false }, { read: true });
}

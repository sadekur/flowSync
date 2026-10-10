import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

export const NOTIFICATION_TYPES = ["task_assigned", "task_updated", "message"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification {
  recipient: Types.ObjectId;
  // Who caused it — never the recipient (self-notifications are filtered out
  // at creation), so the UI can always say "<actor> did X".
  actor: Types.ObjectId;
  type: NotificationType;
  // Denormalized so workspace/project cascade deletes need no join (same
  // pattern as Task/Message's `workspace`).
  workspace: Types.ObjectId;
  project: Types.ObjectId;
  task?: Types.ObjectId;
  message?: Types.ObjectId;
  // A short snapshot of what happened (task title / message snippet), so the
  // list DTO needs no join beyond the actor and survives the source's edits.
  preview: string;
  read: boolean;
}

type NotificationModel = Model<INotification>;

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    task: { type: Schema.Types.ObjectId, ref: "Task" },
    message: { type: Schema.Types.ObjectId, ref: "Message" },
    preview: { type: String, required: true, trim: true, maxlength: 200 },
    read: { type: Boolean, default: false, required: true },
  },
  { timestamps: true },
);

// One index serves both the newest-first list and the unread count.
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

notificationSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

export type NotificationDocument = HydratedDocument<INotification>;
export const Notification = model<INotification, NotificationModel>("Notification", notificationSchema);

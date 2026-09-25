import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

export const MESSAGE_MAX_LENGTH = 2000;

export interface IMessage {
  project: Types.ObjectId;
  // Denormalized from `project.workspace`, same as Task — lets a workspace
  // delete clean up messages without a Project lookup.
  workspace: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
}

type MessageModel = Model<IMessage>;

const messageSchema = new Schema<IMessage, MessageModel>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH },
  },
  { timestamps: true },
);

// History is paged by `_id` (ObjectIds are time-ordered) within one project —
// this one index serves both the "older than" and "newer than" cursors.
messageSchema.index({ project: 1, _id: -1 });

export type MessageDocument = HydratedDocument<IMessage>;
export const Message = model<IMessage, MessageModel>("Message", messageSchema);

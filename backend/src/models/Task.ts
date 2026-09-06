import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface ITask {
  project: Types.ObjectId;
  // Denormalized from `project.workspace` so task queries/membership checks
  // never need an extra Project lookup.
  workspace: Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: Types.ObjectId;
  createdBy: Types.ObjectId;
  dueDate?: Date;
}

type TaskModel = Model<ITask>;

const taskSchema = new Schema<ITask, TaskModel>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: TASK_STATUSES, required: true, default: "todo" },
    assignee: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dueDate: { type: Date },
  },
  { timestamps: true },
);

taskSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

export type TaskDocument = HydratedDocument<ITask>;
export const Task = model<ITask, TaskModel>("Task", taskSchema);

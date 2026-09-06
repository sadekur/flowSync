import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

export interface IWorkspace {
  name: string;
  owner: Types.ObjectId;
  members: Types.ObjectId[];
}

type WorkspaceModel = Model<IWorkspace>;

const workspaceSchema = new Schema<IWorkspace, WorkspaceModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Owner is always included here too — membership checks only ever read this array.
    members: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
  },
  { timestamps: true },
);

workspaceSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

export type WorkspaceDocument = HydratedDocument<IWorkspace>;
export const Workspace = model<IWorkspace, WorkspaceModel>("Workspace", workspaceSchema);

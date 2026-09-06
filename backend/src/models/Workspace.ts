import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

export interface IWorkspace {
  name: string;
  // Generated once from `name` at creation (see utils/slug.ts) and never
  // regenerated on rename — a stable, URL-friendly alternate id.
  slug: string;
  owner: Types.ObjectId;
  members: Types.ObjectId[];
}

type WorkspaceModel = Model<IWorkspace>;

const workspaceSchema = new Schema<IWorkspace, WorkspaceModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
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

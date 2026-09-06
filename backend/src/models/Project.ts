import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

export interface IProject {
  workspace: Types.ObjectId;
  name: string;
  description?: string;
  createdBy: Types.ObjectId;
}

type ProjectModel = Model<IProject>;

const projectSchema = new Schema<IProject, ProjectModel>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

projectSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    ret.__v = undefined;
    return ret;
  },
});

export type ProjectDocument = HydratedDocument<IProject>;
export const Project = model<IProject, ProjectModel>("Project", projectSchema);

import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

// A pending invite to a workspace, addressed to an email rather than a user:
// the person may not have an account yet. Accepting one needs both the
// emailed token and a session for an account with this exact email, so only
// whoever reads that inbox can use it.
export interface IWorkspaceInvite {
  workspace: Types.ObjectId;
  // Lowercased, like User.email.
  email: string;
  invitedBy: Types.ObjectId;
  // sha256 of the emailed token (see utils/tokens.ts).
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type WorkspaceInviteModel = Model<IWorkspaceInvite>;

const workspaceInviteSchema = new Schema<IWorkspaceInvite, WorkspaceInviteModel>(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One pending invite per email per workspace: inviting again replaces the
// token (the old link stops working) and resends.
workspaceInviteSchema.index({ workspace: 1, email: 1 }, { unique: true });
// Deleted by MongoDB's TTL monitor within ~60 s of expiry; lookups still
// check expiresAt themselves.
workspaceInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type WorkspaceInviteDocument = HydratedDocument<IWorkspaceInvite>;
export const WorkspaceInvite = model<IWorkspaceInvite, WorkspaceInviteModel>("WorkspaceInvite", workspaceInviteSchema);

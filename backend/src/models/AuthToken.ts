import { Schema, model, Types, type HydratedDocument, type Model } from "mongoose";

// Single-use tokens mailed to a user. Email verification will add a purpose
// here; workspace invites get their own model (they're for an email address,
// not an existing user).
export const AUTH_TOKEN_PURPOSES = ["password_reset"] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

export interface IAuthToken {
  user: Types.ObjectId;
  purpose: AuthTokenPurpose;
  // sha256 of the token that was emailed. The raw token never touches the
  // database, so a leaked dump can't be used to reset anyone's password.
  tokenHash: string;
  expiresAt: Date;
}

type AuthTokenModel = Model<IAuthToken>;

const authTokenSchema = new Schema<IAuthToken, AuthTokenModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: AUTH_TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB's TTL monitor deletes expired tokens (within ~60 s of expiry, so
// lookups still check expiresAt themselves).
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthTokenDocument = HydratedDocument<IAuthToken>;
export const AuthToken = model<IAuthToken, AuthTokenModel>("AuthToken", authTokenSchema);

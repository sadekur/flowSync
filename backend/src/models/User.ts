import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  // Bumped to invalidate every outstanding refresh token at once (e.g. on password change).
  tokenVersion: number;
  // When the user clicked the link in a verification email (or a reset email,
  // which proves the same thing). null until then. Unverified accounts work
  // normally; the app only shows a banner.
  emailVerifiedAt: Date | null;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, object, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    tokenVersion: { type: Number, required: true, default: 0 },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    ret.passwordHash = undefined;
    ret.__v = undefined;
    return ret;
  },
});

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
export const User = model<IUser, UserModel>("User", userSchema);

import crypto from "node:crypto";

/** A token to email: 32 random bytes, base64url (URL- and fragment-safe). */
export function generateEmailedToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * What gets stored instead of an emailed token. The raw token never touches
 * the database, so a leaked dump can't be used to redeem any link.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

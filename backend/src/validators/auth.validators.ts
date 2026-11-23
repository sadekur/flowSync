import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("must be a valid email");
const newPasswordSchema = z.string().min(8, "password must be at least 8 characters");
// An emailed token (32 random bytes, base64url). The cap only stops junk.
const emailedTokenSchema = z.string().min(1, "token is required").max(200, "token is invalid");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name is too long"),
  email: emailSchema,
  password: newPasswordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "password is required"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: emailedTokenSchema,
  password: newPasswordSchema,
});

export const verifyEmailSchema = z.object({
  token: emailedTokenSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

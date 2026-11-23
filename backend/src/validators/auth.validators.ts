import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("must be a valid email");
const newPasswordSchema = z.string().min(8, "password must be at least 8 characters");

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
  token: z.string().min(1, "token is required").max(200, "token is invalid"),
  password: newPasswordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

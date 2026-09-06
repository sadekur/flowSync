import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name is too long"),
});

export const updateWorkspaceSchema = createWorkspaceSchema;

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("must be a valid email"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;

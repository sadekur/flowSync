import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name is too long"),
  description: z.string().trim().max(2000, "description is too long").optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

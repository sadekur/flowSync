import { z } from "zod";
import { TASK_STATUSES } from "../models/Task";

const statusSchema = z.enum(TASK_STATUSES);
const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200, "title is too long"),
  description: z.string().trim().max(2000, "description is too long").optional(),
  status: statusSchema.default("todo"),
  assignee: objectIdSchema.optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

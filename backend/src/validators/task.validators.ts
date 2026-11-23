import { z } from "zod";
import { TASK_STATUSES } from "../models/Task";

const statusSchema = z.enum(TASK_STATUSES);
const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");

const taskFields = {
  title: z.string().trim().min(1, "title is required").max(200, "title is too long"),
  description: z.string().trim().max(2000, "description is too long").optional(),
  status: statusSchema,
  assignee: objectIdSchema.optional(),
  dueDate: z.coerce.date().optional(),
};

export const createTaskSchema = z.object({ ...taskFields, status: statusSchema.default("todo") });

// Built from the fields, not `createTaskSchema.partial()`: in Zod 4 a
// `.default()` still applies inside `.optional()`, so the partial would fill
// in `status: "todo"` and a title-only PATCH would reset the task's status.
export const updateTaskSchema = z.object(taskFields).partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

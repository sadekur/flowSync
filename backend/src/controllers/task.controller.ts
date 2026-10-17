import type { Request, Response } from "express";
import * as taskService from "../services/task.service";
import { createTaskSchema, updateTaskSchema } from "../validators/task.validators";
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from "../sockets/emitter";
import { notifyTaskAssigned, notifyTaskUpdated } from "../services/notification.service";
import { logger } from "../utils/logger";

// A failed notification must not fail the task write it describes.
async function notify(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error("task notification failed", err);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = createTaskSchema.parse(req.body);
  const task = await taskService.createTask(req.workspace!, req.project!, req.userId as string, input);
  // Broadcast after the write succeeds; the sender's own sockets are in the
  // room too, so they get it as well and the client dedupes by _id.
  emitTaskCreated(task.project.toString(), task);
  await notify(() => notifyTaskAssigned(req.project!, task, req.userId as string));
  res.status(201).json({ task });
}

export async function list(req: Request, res: Response): Promise<void> {
  const tasks = await taskService.listTasks(req.project!);
  res.status(200).json({ tasks });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.status(200).json({ task: req.task });
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = updateTaskSchema.parse(req.body);
  // Read before updateTask mutates the document: a changed assignee is a fresh
  // assignment, an unchanged one is just an update.
  const previousAssignee = req.task!.assignee?.toString();
  const task = await taskService.updateTask(req.workspace!, req.task!, input);
  emitTaskUpdated(task.project.toString(), task);
  await notify(() => notifyTaskUpdated(req.project!, task, req.userId as string, previousAssignee));
  res.status(200).json({ task });
}

export async function remove(req: Request, res: Response): Promise<void> {
  // Capture the id/project before the document is deleted.
  const taskId = req.task!._id.toString();
  const projectId = req.task!.project.toString();
  await taskService.deleteTask(req.task!);
  emitTaskDeleted(projectId, taskId);
  res.status(204).send();
}

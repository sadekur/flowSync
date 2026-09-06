import type { Request, Response } from "express";
import * as taskService from "../services/task.service";
import { createTaskSchema, updateTaskSchema } from "../validators/task.validators";

export async function create(req: Request, res: Response): Promise<void> {
  const input = createTaskSchema.parse(req.body);
  const task = await taskService.createTask(req.workspace!, req.project!, req.userId as string, input);
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
  const task = await taskService.updateTask(req.workspace!, req.task!, input);
  res.status(200).json({ task });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await taskService.deleteTask(req.task!);
  res.status(204).send();
}

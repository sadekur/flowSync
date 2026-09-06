import type { Request, Response } from "express";
import * as projectService from "../services/project.service";
import { createProjectSchema, updateProjectSchema } from "../validators/project.validators";

export async function create(req: Request, res: Response): Promise<void> {
  const input = createProjectSchema.parse(req.body);
  const project = await projectService.createProject(req.workspace!, req.userId as string, input);
  res.status(201).json({ project });
}

export async function list(req: Request, res: Response): Promise<void> {
  const projects = await projectService.listProjects(req.workspace!);
  res.status(200).json({ projects });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.status(200).json({ project: req.project });
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = updateProjectSchema.parse(req.body);
  const project = await projectService.updateProject(req.project!, input);
  res.status(200).json({ project });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await projectService.deleteProject(req.project!);
  res.status(204).send();
}

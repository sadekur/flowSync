import type { Request, Response } from "express";
import * as workspaceService from "../services/workspace.service";
import { addMemberSchema, createWorkspaceSchema, updateWorkspaceSchema } from "../validators/workspace.validators";

export async function create(req: Request, res: Response): Promise<void> {
  const input = createWorkspaceSchema.parse(req.body);
  const workspace = await workspaceService.createWorkspace(req.userId as string, input);
  res.status(201).json({ workspace });
}

export async function list(req: Request, res: Response): Promise<void> {
  const workspaces = await workspaceService.listWorkspacesForUser(req.userId as string);
  res.status(200).json({ workspaces });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  // Populated here only (not in the shared `loadWorkspace` middleware) so
  // membership checks elsewhere keep comparing plain ObjectIds.
  const workspace = await req.workspace!.populate<{
    owner: { name: string; email: string };
    members: { name: string; email: string }[];
  }>([
    { path: "owner", select: "name email" },
    { path: "members", select: "name email" },
  ]);
  res.status(200).json({ workspace });
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = updateWorkspaceSchema.parse(req.body);
  const workspace = await workspaceService.updateWorkspace(req.workspace!, input);
  res.status(200).json({ workspace });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await workspaceService.deleteWorkspace(req.workspace!);
  res.status(204).send();
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const input = addMemberSchema.parse(req.body);
  const workspace = await workspaceService.addMember(req.workspace!, input);
  res.status(200).json({ workspace });
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  const workspace = await workspaceService.removeMember(req.workspace!, req.params.memberId as string);
  res.status(200).json({ workspace });
}

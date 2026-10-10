import type { Request, Response } from "express";
import * as notificationService from "../services/notification.service";

export async function list(req: Request, res: Response): Promise<void> {
  const result = await notificationService.listNotifications(req.userId as string);
  res.status(200).json(result);
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  await notificationService.markAllRead(req.userId as string);
  res.status(204).send();
}

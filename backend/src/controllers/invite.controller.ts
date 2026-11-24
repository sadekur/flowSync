import type { Request, Response } from "express";
import * as inviteService from "../services/invite.service";
import { inviteTokenSchema } from "../validators/invite.validators";

export async function lookup(req: Request, res: Response): Promise<void> {
  const { token } = inviteTokenSchema.parse(req.body);
  const invite = await inviteService.previewInvite(token);
  res.status(200).json({ invite });
}

export async function accept(req: Request, res: Response): Promise<void> {
  const { token } = inviteTokenSchema.parse(req.body);
  const workspace = await inviteService.acceptInvite(token, req.userId as string);
  res.status(200).json({ workspace });
}

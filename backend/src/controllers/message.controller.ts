import type { Request, Response } from "express";
import * as messageService from "../services/message.service";
import { listMessagesQuerySchema } from "../validators/message.validators";

// Read-only: messages are sent over the socket (`message:send`), not REST.
export async function list(req: Request, res: Response): Promise<void> {
  const query = listMessagesQuerySchema.parse(req.query);
  const result = await messageService.listMessages(req.project!, query);
  res.status(200).json(result);
}

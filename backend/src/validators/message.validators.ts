import { z } from "zod";
import { MESSAGE_MAX_LENGTH } from "../models/Message";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");

// Socket payload for `message:send`. projectId is the canonical ObjectId
// (never a slug), same as project:join.
export const sendMessageSchema = z.object({
  projectId: objectIdSchema,
  text: z.string().trim().min(1, "text is required").max(MESSAGE_MAX_LENGTH, "text is too long"),
});

// Query for GET .../messages. `before` pages back through history, `after`
// catches up on anything missed (e.g. while the socket was reconnecting).
export const listMessagesQuerySchema = z
  .object({
    before: objectIdSchema.optional(),
    after: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .refine((q) => !(q.before && q.after), { message: "use either before or after, not both" });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

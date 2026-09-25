import type { Types } from "mongoose";
import { Message } from "../models/Message";
import type { ProjectDocument } from "../models/Project";
import type { ListMessagesQuery } from "../validators/message.validators";

// The one wire shape for a message, used by both the REST history endpoint
// and the `message:new` socket event. Built explicitly so no other sender
// field (e.g. email) ever leaks into a broadcast.
export interface MessageDto {
  _id: string;
  project: string;
  sender: { _id: string; name: string } | null;
  text: string;
  createdAt: string;
}

interface PopulatedMessage {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  sender: { _id: Types.ObjectId; name: string } | null;
  text: string;
  createdAt: Date;
}

function toDto(m: PopulatedMessage): MessageDto {
  return {
    _id: m._id.toString(),
    project: m.project.toString(),
    sender: m.sender ? { _id: m.sender._id.toString(), name: m.sender.name } : null,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function createMessage(project: ProjectDocument, senderId: string, text: string): Promise<MessageDto> {
  const created = await Message.create({
    project: project._id,
    workspace: project.workspace,
    sender: senderId,
    text,
  });

  const message = await Message.findById(created._id)
    .populate<{ sender: PopulatedMessage["sender"] }>("sender", "name")
    .lean<PopulatedMessage>()
    .orFail();
  return toDto(message);
}

/**
 * One page of a project's messages, always returned oldest-first.
 * - no cursor / `before`: the newest `limit` messages (older than `before`)
 * - `after`: the oldest `limit` messages newer than `after`
 * `hasMore` says whether another page exists in the direction being read.
 */
export async function listMessages(
  project: ProjectDocument,
  query: ListMessagesQuery,
): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
  const { before, after, limit } = query;
  const filter: Record<string, unknown> = { project: project._id };
  if (before) filter._id = { $lt: before };
  if (after) filter._id = { $gt: after };

  // Fetch one extra row to learn whether there's another page.
  const rows = await Message.find(filter)
    .sort({ _id: after ? 1 : -1 })
    .limit(limit + 1)
    .populate<{ sender: PopulatedMessage["sender"] }>("sender", "name")
    .lean<PopulatedMessage[]>();

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (!after) page.reverse();

  return { messages: page.map(toDto), hasMore };
}

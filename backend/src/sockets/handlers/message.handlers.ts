import { createMessage, type MessageDto } from "../../services/message.service";
import { sendMessageSchema } from "../../validators/message.validators";
import { isRateLimited } from "../../utils/rateLimit";
import { logger } from "../../utils/logger";
import { findProjectForMember } from "../membership";
import { projectRoom, safeAck, type IoSocket } from "../types";

// Per user, across all their tabs/sockets.
const SEND_LIMIT = 20;
const SEND_WINDOW_SECONDS = 10;

export function registerMessageHandlers(socket: IoSocket): void {
  const { userId } = socket.data;

  socket.on("message:send", async (payload, rawAck) => {
    const ack = safeAck<{ message: MessageDto }>(rawAck);
    const parsed = sendMessageSchema.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" });
      return;
    }
    const { projectId, text } = parsed.data;

    try {
      if (await isRateLimited(`ratelimit:message:${userId}`, SEND_LIMIT, SEND_WINDOW_SECONDS)) {
        ack({ ok: false, error: "You're sending messages too fast" });
        return;
      }

      // Re-checked on every send, not just at project:join — a write is
      // permanent, so a user removed from the workspace must not be able to
      // keep posting from a room they joined earlier.
      const project = await findProjectForMember(projectId, userId);
      if (!project) {
        ack({ ok: false, error: "Project not found" });
        return;
      }

      const message = await createMessage(project, userId, text);
      // Namespace-level emit so the sender's own socket (and their other
      // tabs) get it too; the client dedupes by _id against the ack.
      socket.nsp.to(projectRoom(projectId)).emit("message:new", message);
      ack({ ok: true, message });
    } catch (err) {
      logger.error("message:send failed", err);
      ack({ ok: false, error: "Internal error" });
    }
  });
}

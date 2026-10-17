import mongoose from "mongoose";
import { z } from "zod";
import { logger } from "../../utils/logger";
import { isRateLimited } from "../../utils/rateLimit";
import { findProjectForMember } from "../membership";
import { projectRoom, safeAck, type IoSocket } from "../types";

// Same canonical-ObjectId rule as project:join / message:send.
const typingPayload = z.object({
  projectId: z.string().refine((id) => mongoose.Types.ObjectId.isValid(id), "Invalid projectId"),
});

// Typing is ephemeral spam at worst — the client already throttles to one
// `typing:start` per ~2.5 s, this just caps a misbehaving client per user.
const TYPING_LIMIT = 30;
const TYPING_WINDOW_SECONDS = 10;

export function registerTypingHandlers(socket: IoSocket): void {
  const { userId } = socket.data;

  socket.on("typing:start", async (payload, rawAck) => {
    const ack = safeAck(rawAck);
    const parsed = typingPayload.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: "Invalid projectId" });
      return;
    }
    const { projectId } = parsed.data;

    try {
      if (await isRateLimited(`ratelimit:typing:${userId}`, TYPING_LIMIT, TYPING_WINDOW_SECONDS)) {
        ack({ ok: false, error: "Rate limited" });
        return;
      }

      // Re-checked on every event, like message:send — a member removed from
      // the workspace must not leak activity into rooms they joined earlier.
      if (!(await findProjectForMember(projectId, userId))) {
        ack({ ok: false, error: "Project not found" });
        return;
      }

      // `to`, not `nsp.to`: the sender doesn't need their own typing echoed
      // back. Peers clear the indicator on `typing:stop` or their own expiry.
      socket.to(projectRoom(projectId)).emit("typing:start", { projectId, userId });
      ack({ ok: true });
    } catch (err) {
      logger.error("typing:start failed", err);
      ack({ ok: false, error: "Internal error" });
    }
  });

  socket.on("typing:stop", async (payload, rawAck) => {
    const ack = safeAck(rawAck);
    const parsed = typingPayload.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: "Invalid projectId" });
      return;
    }
    const { projectId } = parsed.data;

    // No membership or rate-limit check: a stop only ever clears an
    // indicator and reveals nothing — keeping it fast matters more, since it
    // is sent when the input clears or the page navigates away.
    try {
      socket.to(projectRoom(projectId)).emit("typing:stop", { projectId, userId });
      ack({ ok: true });
    } catch (err) {
      logger.error("typing:stop failed", err);
      ack({ ok: false, error: "Internal error" });
    }
  });
}

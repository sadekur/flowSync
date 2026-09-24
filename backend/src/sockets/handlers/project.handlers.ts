import mongoose from "mongoose";
import { z } from "zod";
import { Project } from "../../models/Project";
import { Workspace } from "../../models/Workspace";
import { logger } from "../../utils/logger";
import { projectRoom, type Ack, type IoSocket } from "../types";

// Canonical ObjectIds only (no slugs) — one project must map to exactly one
// room name no matter how the page was linked.
const projectPayload = z.object({
  projectId: z.string().refine((id) => mongoose.Types.ObjectId.isValid(id), "Invalid projectId"),
});

// A client can emit without an ack callback; never let that throw.
function safeAck(ack: unknown): Ack {
  return typeof ack === "function" ? (ack as Ack) : () => {};
}

export function registerProjectHandlers(socket: IoSocket): void {
  const { userId } = socket.data;

  socket.on("project:join", async (payload, rawAck) => {
    const ack = safeAck(rawAck);
    const parsed = projectPayload.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: "Invalid projectId" });
      return;
    }
    const { projectId } = parsed.data;

    try {
      const project = await Project.findById(projectId).select("workspace");
      // Same membership rule as requireWorkspaceMember — and the same 404-style
      // answer for "doesn't exist" and "not yours", so ids can't be probed.
      const isMember =
        project &&
        (await Workspace.exists({ _id: project.workspace, members: userId }));

      if (!isMember) {
        ack({ ok: false, error: "Project not found" });
        return;
      }

      await socket.join(projectRoom(projectId));
      logger.info(`socket ${socket.id} (user ${userId}) joined ${projectRoom(projectId)}`);
      ack({ ok: true });
    } catch (err) {
      logger.error("project:join failed", err);
      ack({ ok: false, error: "Internal error" });
    }
  });

  // No membership check needed — leaving a room grants nothing.
  socket.on("project:leave", async (payload, rawAck) => {
    const ack = safeAck(rawAck);
    const parsed = projectPayload.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: "Invalid projectId" });
      return;
    }

    await socket.leave(projectRoom(parsed.data.projectId));
    ack({ ok: true });
  });
}

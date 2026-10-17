import type { TaskDocument } from "../models/Task";
import type { NotificationDto } from "../services/notification.service";
import { projectRoom, userRoom, type IoServer } from "./types";

/**
 * The REST layer (task controllers) needs to broadcast to project rooms, but
 * `io` is created in server.ts *after* the Express app and only then attached
 * to the HTTP server — so it can't be injected into controllers at
 * construction time. It is registered here once at startup instead.
 *
 * Null before the socket server starts and again after it closes, so a REST
 * write in either window silently skips the broadcast rather than throwing.
 */
let io: IoServer | null = null;

export function setIo(server: IoServer | null): void {
  io = server;
}

// `task:*` payloads are the same JSON a REST response returns (Mongoose's
// toJSON strips `__v` and stringifies ids/dates), so clients parse one shape
// whether a task arrives over HTTP or the socket.

export function emitTaskCreated(projectId: string, task: TaskDocument): void {
  io?.to(projectRoom(projectId)).emit("task:created", task);
}

export function emitTaskUpdated(projectId: string, task: TaskDocument): void {
  io?.to(projectRoom(projectId)).emit("task:updated", task);
}

export function emitTaskDeleted(projectId: string, taskId: string): void {
  io?.to(projectRoom(projectId)).emit("task:deleted", { projectId, taskId });
}

// Addressed to a person, not a project: goes to every socket the recipient has
// open (all their tabs), via the room joined at connection.
export function emitNotification(recipientId: string, notification: NotificationDto): void {
  io?.to(userRoom(recipientId)).emit("notification:new", notification);
}

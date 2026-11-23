import type { Message, Notification, Task, User } from "@/types/api";

// ObjectId-shaped ids that sort in creation order (the slices order by _id).
let counter = 0;
export function objectId(): string {
  counter += 1;
  return (Math.floor(Date.now() / 1000).toString(16) + counter.toString(16).padStart(16, "0")).slice(0, 24);
}

export const PROJECT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
export const WORKSPACE_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

export function makeUser(name: string, overrides: Partial<User> = {}): User {
  return {
    _id: objectId(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    tokenVersion: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeMessage(sender: { _id: string; name: string } | null, text: string, overrides: Partial<Message> = {}): Message {
  return {
    _id: objectId(),
    project: PROJECT_ID,
    sender,
    text,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

export function makeTask(title: string, overrides: Partial<Task> = {}): Task {
  return {
    _id: objectId(),
    project: PROJECT_ID,
    workspace: WORKSPACE_ID,
    title,
    status: "todo",
    createdBy: "cccccccccccccccccccccccc",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeNotification(preview: string, overrides: Partial<Notification> = {}): Notification {
  return {
    _id: objectId(),
    type: "task_assigned",
    read: false,
    actor: { _id: "dddddddddddddddddddddddd", name: "Dana" },
    workspace: WORKSPACE_ID,
    project: PROJECT_ID,
    preview,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

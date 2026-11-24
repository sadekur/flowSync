export interface User {
  _id: string;
  name: string;
  email: string;
  tokenVersion: number;
  // null until the user clicks the link in a verification (or reset) email.
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  _id: string;
  name: string;
  slug: string;
  owner: string | User;
  members: (string | User)[];
  createdAt: string;
  updatedAt: string;
}

// Mirrors InviteDto in backend/src/services/invite.service.ts.
export interface WorkspaceInvite {
  _id: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

// Mirrors InvitePreview: what /invite shows to whoever holds the link.
export interface InvitePreview {
  email: string;
  workspaceName: string;
  invitedByName: string;
  expiresAt: string;
}

export interface JoinedWorkspace {
  _id: string;
  name: string;
  slug: string;
}

export interface Project {
  _id: string;
  workspace: string;
  name: string;
  slug: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Same shape from GET .../messages and the `message:new` socket event.
export interface Message {
  _id: string;
  project: string;
  sender: { _id: string; name: string } | null;
  text: string;
  createdAt: string;
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  _id: string;
  project: string;
  workspace: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string;
  createdBy: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = "task_assigned" | "task_updated" | "message";

// Same shape from GET /api/notifications and the `notification:new` socket
// event.
export interface Notification {
  _id: string;
  type: NotificationType;
  read: boolean;
  actor: { _id: string; name: string } | null;
  workspace: string;
  project: string;
  task?: string;
  message?: string;
  preview: string;
  createdAt: string;
}

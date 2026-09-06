export interface User {
  _id: string;
  name: string;
  email: string;
  tokenVersion: number;
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

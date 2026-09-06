import { Task, type TaskDocument } from "../models/Task";
import type { ProjectDocument } from "../models/Project";
import type { WorkspaceDocument } from "../models/Workspace";
import { ApiError } from "../middleware/errorHandler";
import type { CreateTaskInput, UpdateTaskInput } from "../validators/task.validators";

function assertAssigneeIsMember(workspace: WorkspaceDocument, assignee: string | undefined): void {
  if (!assignee) return;

  const isMember = workspace.members.some((m) => m.toString() === assignee);
  if (!isMember) {
    throw new ApiError(400, "Assignee must be a member of the workspace");
  }
}

export async function createTask(
  workspace: WorkspaceDocument,
  project: ProjectDocument,
  createdBy: string,
  input: CreateTaskInput,
): Promise<TaskDocument> {
  assertAssigneeIsMember(workspace, input.assignee);

  return Task.create({
    project: project._id,
    workspace: workspace._id,
    title: input.title,
    description: input.description,
    status: input.status,
    assignee: input.assignee,
    dueDate: input.dueDate,
    createdBy,
  });
}

export async function listTasks(project: ProjectDocument): Promise<TaskDocument[]> {
  return Task.find({ project: project._id }).sort({ createdAt: -1 });
}

export async function updateTask(
  workspace: WorkspaceDocument,
  task: TaskDocument,
  input: UpdateTaskInput,
): Promise<TaskDocument> {
  if (input.assignee !== undefined) {
    assertAssigneeIsMember(workspace, input.assignee);
    task.set("assignee", input.assignee);
  }
  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined) task.description = input.description;
  if (input.status !== undefined) task.status = input.status;
  if (input.dueDate !== undefined) task.dueDate = input.dueDate;

  await task.save();
  return task;
}

export async function deleteTask(task: TaskDocument): Promise<void> {
  await task.deleteOne();
}

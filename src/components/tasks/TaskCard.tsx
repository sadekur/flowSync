"use client";

import { memo } from "react";
import { TaskStatusSelect } from "./TaskStatusSelect";
import type { Task } from "@/types/api";

// memo: a task update (its own broadcast or another user's) re-renders the
// list, but not every other card.
export const TaskCard = memo(function TaskCard({
  workspaceId,
  projectId,
  task,
}: {
  workspaceId: string;
  projectId: string;
  task: Task;
}) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-black/10 px-4 py-3 dark:border-white/10">
      <div>
        <p className="font-medium">{task.title}</p>
        {task.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{task.description}</p>}
      </div>
      <TaskStatusSelect
        workspaceId={workspaceId}
        projectId={projectId}
        taskId={task._id}
        status={task.status}
      />
    </li>
  );
});

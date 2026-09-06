"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import type { TaskStatus } from "@/types/api";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function TaskStatusSelect({
  workspaceId,
  projectId,
  taskId,
  status,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  status: TaskStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleChange(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    setPending(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: event.target.value }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <select
      defaultValue={status}
      onChange={handleChange}
      disabled={pending}
      className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useState, type ChangeEvent } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import { useAppDispatch } from "@/store/hooks";
import { taskUpserted } from "@/store/tasksSlice";
import type { Task, TaskStatus } from "@/types/api";

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
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic value while the PATCH is in flight, so the change shows
  // immediately instead of snapping back until the store updates. Once the
  // request settles it's cleared, and the store (REST response + broadcast)
  // is again the single source of truth — including another user's change.
  const [optimistic, setOptimistic] = useState<TaskStatus | null>(null);
  const value = optimistic ?? status;

  async function handleChange(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    const next = event.target.value as TaskStatus;
    setOptimistic(next);
    setError(null);
    setPending(true);

    try {
      const { task } = await apiFetch<{ task: Task }>(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
        { method: "PATCH", body: JSON.stringify({ status: next }) },
      );
      // The same change also arrives as a task:updated broadcast; upserting by
      // _id makes the duplicate harmless.
      dispatch(taskUpserted({ projectId, task }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update status");
    } finally {
      setOptimistic(null);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        onChange={handleChange}
        disabled={pending}
        className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
      >
        {Object.entries(STATUS_LABELS).map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

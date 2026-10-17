"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import { useAppDispatch } from "@/store/hooks";
import { taskUpserted } from "@/store/tasksSlice";
import type { Task, User } from "@/types/api";

export function CreateTaskForm({
  workspaceId,
  projectId,
  members,
}: {
  workspaceId: string;
  projectId: string;
  members: User[];
}) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { task } = await apiFetch<{ task: Task }>(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks`,
        { method: "POST", body: JSON.stringify({ title, assignee: assignee || undefined }) },
      );
      // Show it straight away; the matching task:created broadcast is deduped
      // by _id in the reducer.
      dispatch(taskUpserted({ projectId, task }));
      setTitle("");
      setAssignee("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task title"
        required
        className="flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
      />
      <select
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
      >
        <option value="">Unassigned</option>
        {members.map((member) => (
          <option key={member._id} value={member._id}>
            {member.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
      >
        Add task
      </button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

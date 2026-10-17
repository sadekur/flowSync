"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/client-api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAllTasks, tasksHydrated } from "@/store/tasksSlice";
import { TaskCard } from "./TaskCard";
import type { Task } from "@/types/api";

// The live task list for the open project. Seeded from a server-fetched page,
// then kept current by task:* broadcasts (via socketMiddleware) — mutations
// no longer need a router.refresh().
export function TaskList({
  workspaceId,
  projectId,
  initialTasks,
}: {
  workspaceId: string;
  // Canonical ObjectId — must match `task.project` on incoming events.
  projectId: string;
  initialTasks: Task[];
}) {
  const dispatch = useAppDispatch();

  // Until the hydrate effect has run, render the server-fetched page directly
  // so the first paint isn't empty.
  const storeReady = useAppSelector((s) => s.tasks.projectId === projectId);
  const storeTasks = useAppSelector(selectAllTasks);
  const tasks = storeReady ? storeTasks : initialTasks;

  const inRoom = useAppSelector((s) => s.socket.joinedProjectId === projectId);

  useEffect(() => {
    dispatch(tasksHydrated({ projectId, tasks: initialTasks }));
  }, [dispatch, projectId, initialTasks]);

  // Catch-up on every (re)join: covers task changes made between the server
  // render and the join, or while this tab was disconnected. Live events only
  // cover time spent in the room.
  useEffect(() => {
    if (!inRoom) return;
    let cancelled = false;

    apiFetch<{ tasks: Task[] }>(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .then((res) => {
        if (!cancelled) dispatch(tasksHydrated({ projectId, tasks: res.tasks }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [inRoom, workspaceId, projectId, dispatch]);

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <TaskCard key={task._id} workspaceId={workspaceId} projectId={projectId} task={task} />
      ))}
      {tasks.length === 0 && <li className="text-sm text-zinc-500">No tasks yet.</li>}
    </ul>
  );
}

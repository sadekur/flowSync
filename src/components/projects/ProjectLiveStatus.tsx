"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { joinProject, leaveProject } from "@/store/socketSlice";

// Joins this project's socket room for as long as the page is mounted, and
// shows whether the page is actually receiving real-time updates.
export function ProjectLiveStatus({ projectId }: { projectId: string }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.socket.status);
  const inRoom = useAppSelector((s) => s.socket.joinedProjectId === projectId);
  const error = useAppSelector((s) => s.socket.error);

  useEffect(() => {
    dispatch(joinProject(projectId));
    return () => {
      dispatch(leaveProject(projectId));
    };
  }, [dispatch, projectId]);

  const live = status === "connected" && inRoom;
  const label = live
    ? "Live"
    : status === "reconnecting"
      ? "Reconnecting…"
      : status === "error"
        ? "Offline"
        : "Connecting…";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
      title={!live && error ? error : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

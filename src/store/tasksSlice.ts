import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Task } from "@/types/api";
import { socketDisconnect } from "./socketSlice";
import type { RootState } from "./index";

// Newest first, matching GET .../tasks (createdAt: -1). ObjectIds are
// time-ordered hex strings of equal length, so a plain string compare sorts
// without parsing dates.
const tasksAdapter = createEntityAdapter({
  selectId: (task: Task) => task._id,
  sortComparer: (a, b) => (a._id < b._id ? 1 : a._id > b._id ? -1 : 0),
});

// Holds one project's tasks at a time — the project page currently open.
const initialState = tasksAdapter.getInitialState({
  projectId: null as string | null,
  // While a catch-up fetch is in flight: the ids live events changed since it
  // started. Their current state is newer than the fetched list, so the
  // reconcile keeps it. null when no catch-up is running.
  syncTouched: null as Record<string, true> | null,
});

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    // The server-rendered page. Merging when it's the same project keeps live
    // state the store already has; switching projects replaces. Deletions are
    // reconciled by the catch-up below, which runs right after the join.
    tasksHydrated(state, action: PayloadAction<{ projectId: string; tasks: Task[] }>) {
      const { projectId, tasks } = action.payload;
      if (state.projectId === projectId) {
        tasksAdapter.upsertMany(state, tasks);
        return;
      }
      tasksAdapter.setAll(state, tasks);
      state.projectId = projectId;
      state.syncTouched = null;
    },
    // The catch-up on every (re)join, in two halves around the fetch.
    tasksSyncStarted(state, action: PayloadAction<{ projectId: string }>) {
      if (state.projectId !== action.payload.projectId) return;
      state.syncTouched = {};
    },
    // The fetched list is the full set (it isn't paged), so it replaces the
    // store: that drops tasks deleted while this tab was out of the room.
    // Tasks a live event touched mid-fetch keep their live state instead,
    // since the fetch may have been served before that event.
    tasksSynced(state, action: PayloadAction<{ projectId: string; tasks: Task[] }>) {
      const { projectId, tasks } = action.payload;
      if (state.projectId !== projectId || !state.syncTouched) return;
      const touched = state.syncTouched;
      const keep = Object.keys(touched)
        .map((id) => state.entities[id])
        .filter((task): task is Task => task !== undefined);
      tasksAdapter.setAll(state, [...tasks.filter((t) => !touched[t._id]), ...keep]);
      state.syncTouched = null;
    },
    // `task:created` / `task:updated` broadcasts, plus a mutation's own REST
    // response so the actor sees the change before the broadcast lands.
    // Upserting by _id makes receiving the same task twice harmless.
    taskUpserted(state, action: PayloadAction<{ projectId: string; task: Task }>) {
      if (state.projectId !== action.payload.projectId) return;
      tasksAdapter.upsertOne(state, action.payload.task);
      if (state.syncTouched) state.syncTouched[action.payload.task._id] = true;
    },
    taskRemoved(state, action: PayloadAction<{ projectId: string; taskId: string }>) {
      if (state.projectId !== action.payload.projectId) return;
      tasksAdapter.removeOne(state, action.payload.taskId);
      if (state.syncTouched) state.syncTouched[action.payload.taskId] = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(socketDisconnect, () => initialState);
  },
});

export const { tasksHydrated, taskUpserted, taskRemoved } = tasksSlice.actions;

export const { selectAll: selectAllTasks } = tasksAdapter.getSelectors((state: RootState) => state.tasks);

export default tasksSlice.reducer;

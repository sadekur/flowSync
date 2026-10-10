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
});

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    // Server-fetched list: the initial page render, and the catch-up fetch on
    // every (re)join. Merging when it's the same project keeps a live event
    // that raced the fetch from being clobbered; switching projects replaces.
    tasksHydrated(state, action: PayloadAction<{ projectId: string; tasks: Task[] }>) {
      const { projectId, tasks } = action.payload;
      if (state.projectId === projectId) {
        tasksAdapter.upsertMany(state, tasks);
        return;
      }
      tasksAdapter.setAll(state, tasks);
      state.projectId = projectId;
    },
    // `task:created` / `task:updated` broadcasts, plus a mutation's own REST
    // response so the actor sees the change before the broadcast lands.
    // Upserting by _id makes receiving the same task twice harmless.
    taskUpserted(state, action: PayloadAction<{ projectId: string; task: Task }>) {
      if (state.projectId !== action.payload.projectId) return;
      tasksAdapter.upsertOne(state, action.payload.task);
    },
    taskRemoved(state, action: PayloadAction<{ projectId: string; taskId: string }>) {
      if (state.projectId !== action.payload.projectId) return;
      tasksAdapter.removeOne(state, action.payload.taskId);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(socketDisconnect, () => initialState);
  },
});

export const { tasksHydrated, taskUpserted, taskRemoved } = tasksSlice.actions;

export const { selectAll: selectAllTasks } = tasksAdapter.getSelectors((state: RootState) => state.tasks);

export default tasksSlice.reducer;

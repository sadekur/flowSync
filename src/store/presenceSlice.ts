import { createAction, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { leaveProject, socketDisconnect } from "./socketSlice";

// Commands handled by socketMiddleware — components dispatch these instead
// of touching the Socket.IO client themselves. Fire-and-forget: the
// middleware throttles `typing:start` and translates both into socket emits.
export const typingStart = createAction<{ projectId: string }>("presence/typingStart");
export const typingStop = createAction<{ projectId: string }>("presence/typingStop");

interface PresenceState {
  // The project this slice tracks — presence is per project room, and the
  // page only ever shows one project at a time (same rule as messages).
  projectId: string | null;
  onlineUserIds: string[];
  typingUserIds: string[];
}

const initialState: PresenceState = {
  projectId: null,
  onlineUserIds: [],
  typingUserIds: [],
};

const presenceSlice = createSlice({
  name: "presence",
  initialState,
  reducers: {
    // The join-ack snapshot: the authoritative online list for the project
    // replaces whatever accumulated while the room wasn't confirmed yet.
    presenceHydrated(state, action: PayloadAction<{ projectId: string; onlineUserIds: string[] }>) {
      const { projectId, onlineUserIds } = action.payload;
      if (state.projectId !== projectId) {
        state.projectId = projectId;
        state.onlineUserIds = onlineUserIds;
        state.typingUserIds = [];
        return;
      }
      state.onlineUserIds = onlineUserIds;
    },
    // Reducers are idempotent on purpose: the server can legally deliver the
    // same user:online/user:offline twice (multi-tab races), so pushes and
    // filters must not double-count or care about missing entries.
    userOnline(state, action: PayloadAction<{ projectId: string; userId: string }>) {
      const { projectId, userId } = action.payload;
      if (state.projectId !== projectId) return;
      if (!state.onlineUserIds.includes(userId)) state.onlineUserIds.push(userId);
    },
    userOffline(state, action: PayloadAction<{ projectId: string; userId: string }>) {
      const { projectId, userId } = action.payload;
      if (state.projectId !== projectId) return;
      state.onlineUserIds = state.onlineUserIds.filter((id) => id !== userId);
      state.typingUserIds = state.typingUserIds.filter((id) => id !== userId);
    },
    typingStarted(state, action: PayloadAction<{ projectId: string; userId: string }>) {
      const { projectId, userId } = action.payload;
      if (state.projectId !== projectId) return;
      if (!state.typingUserIds.includes(userId)) state.typingUserIds.push(userId);
    },
    typingStopped(state, action: PayloadAction<{ projectId: string; userId: string }>) {
      const { projectId, userId } = action.payload;
      if (state.projectId !== projectId) return;
      state.typingUserIds = state.typingUserIds.filter((id) => id !== userId);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(socketDisconnect, () => initialState)
      .addCase(leaveProject, (state, action) => {
        if (state.projectId === action.payload) return initialState;
      });
  },
});

export const { presenceHydrated, userOnline, userOffline, typingStarted, typingStopped } = presenceSlice.actions;

export default presenceSlice.reducer;

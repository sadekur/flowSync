import { createAction, createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Commands handled by socketMiddleware — components dispatch these instead of
// touching the Socket.IO client themselves.
export const socketConnect = createAction("socket/connect");
export const socketDisconnect = createAction("socket/disconnect");
export const joinProject = createAction<string>("socket/joinProject");
export const leaveProject = createAction<string>("socket/leaveProject");

export type SocketStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

interface SocketState {
  status: SocketStatus;
  error: string | null;
  // Set only once the server acks the join, so the UI never claims "live"
  // for a room it isn't actually in.
  joinedProjectId: string | null;
}

const initialState: SocketState = { status: "idle", error: null, joinedProjectId: null };

const socketSlice = createSlice({
  name: "socket",
  initialState,
  reducers: {
    // Dispatched by socketMiddleware only, translating Socket.IO client events.
    connected(state) {
      state.status = "connected";
      state.error = null;
    },
    // Rooms are per-connection server-side, so any disconnect drops the room.
    disconnected(state, action: PayloadAction<{ willReconnect: boolean }>) {
      state.status = action.payload.willReconnect ? "reconnecting" : "idle";
      state.joinedProjectId = null;
    },
    connectFailed(state, action: PayloadAction<{ message: string; willRetry: boolean }>) {
      state.status = action.payload.willRetry ? "reconnecting" : "error";
      state.error = action.payload.message;
    },
    roomJoined(state, action: PayloadAction<string>) {
      state.joinedProjectId = action.payload;
      state.error = null;
    },
    roomJoinFailed(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(socketConnect, (state) => {
        if (state.status === "idle" || state.status === "error") state.status = "connecting";
      })
      .addCase(socketDisconnect, () => initialState)
      .addCase(leaveProject, (state, action) => {
        if (state.joinedProjectId === action.payload) state.joinedProjectId = null;
      });
  },
});

export const { connected, disconnected, connectFailed, roomJoined, roomJoinFailed } = socketSlice.actions;
export default socketSlice.reducer;

import { createAction, createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Message } from "@/types/api";
import { socketDisconnect } from "./socketSlice";
import type { RootState } from "./index";

// Command handled by socketMiddleware; dispatching it resolves to the ack
// result (see SocketDispatchExt there), so the chat form knows whether to
// clear its input.
export const sendMessage = createAction<{ projectId: string; text: string }>("messages/send");

// ObjectIds are time-ordered hex strings of equal length, so a plain string
// compare sorts messages oldest-first — the same order the API pages by.
const messagesAdapter = createEntityAdapter({
  selectId: (message: Message) => message._id,
  sortComparer: (a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0),
});

// Holds one project's chat at a time — the project page currently open.
const initialState = messagesAdapter.getInitialState({
  projectId: null as string | null,
  hasOlder: false,
});

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    // Server-fetched first page. Re-hydrating the same project (e.g. after a
    // router.refresh()) merges instead of replacing, so live messages and
    // already-loaded older pages aren't thrown away.
    messagesHydrated(state, action: PayloadAction<{ projectId: string; messages: Message[]; hasOlder: boolean }>) {
      const { projectId, messages, hasOlder } = action.payload;
      if (state.projectId === projectId) {
        messagesAdapter.upsertMany(state, messages);
        return;
      }
      messagesAdapter.setAll(state, messages);
      state.projectId = projectId;
      state.hasOlder = hasOlder;
    },
    olderMessagesLoaded(state, action: PayloadAction<{ projectId: string; messages: Message[]; hasOlder: boolean }>) {
      if (state.projectId !== action.payload.projectId) return;
      messagesAdapter.upsertMany(state, action.payload.messages);
      state.hasOlder = action.payload.hasOlder;
    },
    // Live `message:new` events, send acks and reconnect catch-up all land
    // here; upserting by _id makes receiving the same message twice harmless.
    messagesReceived(state, action: PayloadAction<{ projectId: string; messages: Message[] }>) {
      if (state.projectId !== action.payload.projectId) return;
      messagesAdapter.upsertMany(state, action.payload.messages);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(socketDisconnect, () => initialState);
  },
});

export const { messagesHydrated, olderMessagesLoaded, messagesReceived } = messagesSlice.actions;

export const { selectAll: selectAllMessages } = messagesAdapter.getSelectors((state: RootState) => state.messages);

export default messagesSlice.reducer;

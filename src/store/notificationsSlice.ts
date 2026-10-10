import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Notification } from "@/types/api";
import { socketDisconnect } from "./socketSlice";
import type { RootState } from "./index";

// Newest first, matching GET /api/notifications (sort by descending _id —
// ObjectIds are time-ordered, so no date parsing).
const notificationsAdapter = createEntityAdapter({
  selectId: (notification: Notification) => notification._id,
  sortComparer: (a, b) => (a._id < b._id ? 1 : a._id > b._id ? -1 : 0),
});

const initialState = notificationsAdapter.getInitialState({
  // Kept separately because it's a true server-side count, so the badge is
  // right even if more than the fetched page are unread.
  unreadCount: 0,
});

const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    notificationsHydrated(
      state,
      action: PayloadAction<{ notifications: Notification[]; unreadCount: number }>,
    ) {
      notificationsAdapter.setAll(state, action.payload.notifications);
      state.unreadCount = action.payload.unreadCount;
    },
    // Live `notification:new`. Idempotent: a re-delivered id doesn't bump the
    // count again (upsert by _id, count only when the id is new and unread).
    notificationReceived(state, action: PayloadAction<Notification>) {
      const notification = action.payload;
      const isNew = state.entities[notification._id] === undefined;
      notificationsAdapter.upsertOne(state, notification);
      if (isNew && !notification.read) state.unreadCount += 1;
    },
    allMarkedRead(state) {
      for (const id of state.ids) {
        const notification = state.entities[id];
        if (notification) notification.read = true;
      }
      state.unreadCount = 0;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(socketDisconnect, () => initialState);
  },
});

export const { notificationsHydrated, notificationReceived, allMarkedRead } = notificationsSlice.actions;

export const { selectAll: selectAllNotifications } = notificationsAdapter.getSelectors(
  (state: RootState) => state.notifications,
);

export default notificationsSlice.reducer;

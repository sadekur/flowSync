import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import socketReducer from "./socketSlice";
import messagesReducer from "./messagesSlice";
import { createSocketMiddleware } from "./socketMiddleware";

// A factory, not a module-level singleton: Next.js Server Components share
// one Node process across users/requests, so a shared store instance would
// leak state between them. StoreProvider calls this fresh per component tree.
export function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      socket: socketReducer,
      messages: messagesReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(createSocketMiddleware()),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

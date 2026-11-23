import type { ReactElement } from "react";
import { afterEach } from "vitest";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/store";
import { socketDisconnect } from "@/store/socketSlice";

const stores: AppStore[] = [];

// Tears down each store's socket and typing timers so nothing leaks into the
// next test.
afterEach(() => {
  for (const store of stores.splice(0)) store.dispatch(socketDisconnect());
});

/** Renders `ui` inside a real (per-test) Redux store, like StoreProvider does. */
export function renderWithStore(ui: ReactElement, store: AppStore = makeStore()) {
  stores.push(store);
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

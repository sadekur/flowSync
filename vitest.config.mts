import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two projects share one runner (`npm test`):
// - backend: real Express + Socket.IO server against a local *test* Mongo
//   database and Redis DB (see backend/tests/setup/env.ts), run one file at a
//   time because every file shares that database and resets it between tests.
// - frontend: Redux slices, socketMiddleware and components in jsdom, with the
//   network (apiFetch, socket.io-client) mocked.
export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json's `paths`; also used by the backend project's
    // client-reconnect test, which runs the real Redux store.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Server logs (socket connected, …) only show for failing tests.
    silent: "passed-only",
    projects: [
      {
        extends: true,
        test: {
          name: "backend",
          environment: "node",
          include: ["backend/tests/**/*.test.ts"],
          setupFiles: ["backend/tests/setup/env.ts"],
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["src/test/setup.ts"],
        },
      },
    ],
  },
});

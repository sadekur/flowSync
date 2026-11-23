import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { TaskList } from "./TaskList";
import { apiFetch } from "@/lib/client-api";
import { connected, disconnected, roomJoined } from "@/store/socketSlice";
import { makeTask, PROJECT_ID, WORKSPACE_ID } from "@/test/factories";
import { renderWithStore } from "@/test/render";

vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("TaskList catch-up", () => {
  it("removes a task deleted while disconnected once the room is re-joined", async () => {
    const kept = makeTask("Kept");
    const gone = makeTask("Deleted elsewhere");
    vi.mocked(apiFetch).mockResolvedValue({ tasks: [kept, gone] });

    const { store } = renderWithStore(
      <TaskList workspaceId={WORKSPACE_ID} projectId={PROJECT_ID} initialTasks={[kept, gone]} />,
    );
    act(() => {
      store.dispatch(connected());
      store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [] }));
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith(`/api/workspaces/${WORKSPACE_ID}/projects/${PROJECT_ID}/tasks`);

    // Offline: someone deletes a task, and this tab misses the task:deleted.
    act(() => {
      store.dispatch(disconnected({ willReconnect: true }));
    });
    vi.mocked(apiFetch).mockResolvedValue({ tasks: [kept] });
    act(() => {
      store.dispatch(connected());
      store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [] }));
    });

    await waitFor(() => expect(screen.queryByText("Deleted elsewhere")).toBeNull());
    expect(screen.getByText("Kept")).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

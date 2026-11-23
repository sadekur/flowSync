import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskCard } from "./TaskCard";
import { apiFetch, ApiError } from "@/lib/client-api";
import { tasksHydrated } from "@/store/tasksSlice";
import { makeTask, PROJECT_ID, WORKSPACE_ID } from "@/test/factories";
import { renderWithStore } from "@/test/render";

vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("TaskCard status select", () => {
  it("shows the change at once, PATCHes it, and puts the saved task in the store", async () => {
    const task = makeTask("Write tests", { description: "Step 12" });
    const request = deferred<{ task: typeof task }>();
    vi.mocked(apiFetch).mockReturnValue(request.promise);

    const { store } = renderWithStore(<TaskCard workspaceId={WORKSPACE_ID} projectId={PROJECT_ID} task={task} />);
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [task] }));
    expect(screen.getByText("Write tests")).toBeTruthy();
    expect(screen.getByText("Step 12")).toBeTruthy();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await userEvent.selectOptions(select, "done");

    // Optimistic while in flight, and locked against a second change.
    expect(select.value).toBe("done");
    expect(select.disabled).toBe(true);
    expect(apiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${WORKSPACE_ID}/projects/${PROJECT_ID}/tasks/${task._id}`,
      { method: "PATCH", body: JSON.stringify({ status: "done" }) },
    );

    await act(async () => request.resolve({ task: { ...task, status: "done" } }));
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(store.getState().tasks.entities[task._id]?.status).toBe("done");
  });

  it("reverts and shows the API's error when the PATCH fails", async () => {
    const task = makeTask("Locked", { status: "in_progress" });
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(403, "Not a member of this workspace"));
    renderWithStore(<TaskCard workspaceId={WORKSPACE_ID} projectId={PROJECT_ID} task={task} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await userEvent.selectOptions(select, "done");

    expect(await screen.findByText("Not a member of this workspace")).toBeTruthy();
    expect(select.value).toBe("in_progress");
    expect(select.disabled).toBe(false);
  });

  it("falls back to a generic error for a network failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError("fetch failed"));
    renderWithStore(<TaskCard workspaceId={WORKSPACE_ID} projectId={PROJECT_ID} task={makeTask("Offline")} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "in_progress");
    expect(await screen.findByText("Couldn't update status")).toBeTruthy();
  });
});

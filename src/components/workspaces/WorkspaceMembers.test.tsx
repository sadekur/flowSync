import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceMembers, type MemberSummary } from "./WorkspaceMembers";
import { apiFetch, ApiError } from "@/lib/client-api";
import { renderWithStore } from "@/test/render";
import type { WorkspaceInvite } from "@/types/api";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

const alice: MemberSummary = { _id: "u-alice", name: "Alice", email: "alice@example.com" };
const bob: MemberSummary = { _id: "u-bob", name: "Bob", email: "bob@example.com" };
const pending: WorkspaceInvite = {
  _id: "inv1",
  email: "carol@example.com",
  invitedBy: alice._id,
  expiresAt: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-11-24T00:00:00.000Z",
};

function renderPanel(isOwner = true) {
  return renderWithStore(
    <WorkspaceMembers workspaceId="ws1" ownerId={alice._id} isOwner={isOwner} members={[alice, bob]} invites={isOwner ? [pending] : []} />,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  refresh.mockReset();
});

describe("WorkspaceMembers", () => {
  it("says whether the address was added or invited, and refreshes", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ invite: { ...pending, email: "dave@example.com" } });
    renderPanel();

    await userEvent.type(screen.getByLabelText("Add someone by email"), "dave@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces/ws1/members", {
      method: "POST",
      body: JSON.stringify({ email: "dave@example.com" }),
    });
    expect((await screen.findByRole("status")).textContent).toBe("Invite emailed to dave@example.com.");
    expect((screen.getByLabelText("Add someone by email") as HTMLInputElement).value).toBe("");
    expect(refresh).toHaveBeenCalled();

    vi.mocked(apiFetch).mockResolvedValueOnce({ workspace: {} });
    await userEvent.type(screen.getByLabelText("Add someone by email"), "erin@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("status")).textContent).toBe("erin@example.com was added and told by email.");
  });

  it("shows the API's error and keeps what was typed", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(409, "User is already a member"));
    renderPanel();

    await userEvent.type(screen.getByLabelText("Add someone by email"), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe("User is already a member");
    expect((screen.getByLabelText("Add someone by email") as HTMLInputElement).value).toBe("bob@example.com");
  });

  it("removes members (never the owner) and cancels invites", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderPanel();

    expect(screen.queryByRole("button", { name: "Remove Alice" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove Bob" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces/ws1/members/u-bob", { method: "DELETE" });

    await userEvent.click(screen.getByRole("button", { name: "Cancel the invite to carol@example.com" }));
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces/ws1/invites/inv1", { method: "DELETE" });
    expect((await screen.findByRole("status")).textContent).toBe("The invite to carol@example.com was cancelled.");
  });

  it("is read-only for members: no form, no buttons, no invites", () => {
    renderPanel(false);
    expect(screen.queryByLabelText("Add someone by email")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/Pending invites/)).toBeNull();
    expect(screen.getByText("Members (2)")).toBeTruthy();
  });
});

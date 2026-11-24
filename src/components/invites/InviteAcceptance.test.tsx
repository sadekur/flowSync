import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteAcceptance } from "./InviteAcceptance";
import { apiFetch, ApiError } from "@/lib/client-api";
import { renderWithStore } from "@/test/render";
import { makeUser } from "@/test/factories";
import type { InvitePreview } from "@/types/api";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

const invite: InvitePreview = {
  email: "newcomer@example.com",
  workspaceName: "Design Team",
  invitedByName: "Alice",
  expiresAt: "2026-12-01T00:00:00.000Z",
};
const joined = { _id: "ws1", name: "Design Team", slug: "design-team" };

/** apiFetch answering by path; anything not listed fails the test. */
function api(routes: Record<string, (body: Record<string, unknown>) => unknown>) {
  vi.mocked(apiFetch).mockImplementation(async (path, init) => {
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected call to ${path}`);
    return handler(JSON.parse((init?.body as string | undefined) ?? "{}"));
  });
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  push.mockReset();
  replace.mockReset();
  window.history.replaceState(null, "", "/invite#token=invite_123-XYZ");
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("InviteAcceptance", () => {
  it("looks the invite up and signs a new person up with the invited email fixed", async () => {
    const register = vi.fn(() => ({ user: makeUser("Newcomer", { email: invite.email }), workspace: joined, inviteError: null }));
    api({ "/api/invites/lookup": () => ({ invite }), "/api/auth/register": register });
    renderWithStore(<InviteAcceptance user={null} />);

    expect((await screen.findByText(/invited/)).textContent).toBe(
      "Alice invited newcomer@example.com to join Design Team.",
    );
    expect(apiFetch).toHaveBeenCalledWith("/api/invites/lookup", {
      method: "POST",
      body: JSON.stringify({ token: "invite_123-XYZ" }),
    });

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    expect(emailInput.value).toBe(invite.email);
    expect(emailInput.readOnly).toBe(true);

    await userEvent.type(screen.getByLabelText("Name"), "Newcomer");
    // The first interaction strips the token from the address bar.
    expect(replace).toHaveBeenCalledWith("/invite", { scroll: false });
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(register).toHaveBeenCalledWith({
      name: "Newcomer",
      email: invite.email,
      password: "password123",
      inviteToken: "invite_123-XYZ",
    });
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("says why when the account was created but the invite didn't work", async () => {
    api({
      "/api/invites/lookup": () => ({ invite }),
      "/api/auth/register": () => ({
        user: makeUser("Newcomer", { email: invite.email }),
        workspace: null,
        inviteError: "This invite link is invalid or has expired.",
      }),
    });
    renderWithStore(<InviteAcceptance user={null} />);

    await userEvent.type(await screen.findByLabelText("Name"), "Newcomer");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect((await screen.findByRole("alert")).textContent).toContain("invalid or has expired");
    expect(push).not.toHaveBeenCalled();
  });

  it("logs an existing account in, then accepts", async () => {
    const accept = vi.fn(() => ({ workspace: joined }));
    api({
      "/api/invites/lookup": () => ({ invite }),
      "/api/auth/login": () => ({ user: makeUser("Newcomer", { email: invite.email }) }),
      "/api/invites/accept": accept,
    });
    renderWithStore(<InviteAcceptance user={null} />);

    await userEvent.click(await screen.findByRole("button", { name: "Log in instead" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(invite.email);
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(accept).toHaveBeenCalledWith({ token: "invite_123-XYZ" });
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("offers a Join button to the invited account, and shows the API's error", async () => {
    api({
      "/api/invites/lookup": () => ({ invite }),
      "/api/invites/accept": () => {
        throw new ApiError(400, "This invite link is invalid or has expired.");
      },
    });
    renderWithStore(<InviteAcceptance user={makeUser("Newcomer", { email: invite.email })} />);

    await userEvent.click(await screen.findByRole("button", { name: "Join Design Team" }));
    expect((await screen.findByRole("alert")).textContent).toContain("invalid or has expired");
    expect(push).not.toHaveBeenCalled();
  });

  it("tells a different logged-in account that the invite isn't theirs, with no Join button", async () => {
    api({ "/api/invites/lookup": () => ({ invite }) });
    renderWithStore(<InviteAcceptance user={makeUser("Mallory")} />);

    expect((await screen.findByText(/You're logged in as/)).textContent).toContain("mallory@example.com");
    expect(screen.queryByRole("button", { name: /Join/ })).toBeNull();
  });

  it("shows the lookup's error for a dead link, and a hint when there's no token at all", async () => {
    api({
      "/api/invites/lookup": () => {
        throw new ApiError(400, "This invite link is invalid or has expired. Ask the workspace owner for a new one.");
      },
    });
    const { unmount } = renderWithStore(<InviteAcceptance user={null} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Ask the workspace owner");
    unmount();

    window.history.replaceState(null, "", "/invite");
    vi.mocked(apiFetch).mockReset();
    renderWithStore(<InviteAcceptance user={null} />);
    expect(await screen.findByText(/needs the link from your invite email/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

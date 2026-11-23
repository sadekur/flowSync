import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "./NotificationBell";
import { apiFetch } from "@/lib/client-api";
import { notificationReceived } from "@/store/notificationsSlice";
import { makeNotification, PROJECT_ID, WORKSPACE_ID } from "@/test/factories";
import { renderWithStore } from "@/test/render";

vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

function mockApi(list: { notifications: unknown[]; unreadCount: number }) {
  vi.mocked(apiFetch).mockImplementation(async (path: string) =>
    path === "/api/notifications" ? list : undefined,
  );
}

const bell = () => screen.getByRole("button", { name: /^Notifications/ });

describe("NotificationBell", () => {
  it("loads the list on mount and shows the server's unread count, capped at 9+", async () => {
    mockApi({ notifications: [makeNotification("Review PR")], unreadCount: 12 });
    renderWithStore(<NotificationBell />);
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications (12 unread)"));
    expect(bell().textContent).toBe("9+");
    expect(apiFetch).toHaveBeenCalledWith("/api/notifications");
  });

  it("marks everything read when opened, and lists each notification with a link to its project", async () => {
    mockApi({
      notifications: [
        makeNotification("Fix login", { type: "task_updated" }),
        makeNotification("hello all", { type: "message", actor: { _id: "x", name: "Eve" } }),
      ],
      unreadCount: 2,
    });
    renderWithStore(<NotificationBell />);
    await waitFor(() => expect(bell().textContent).toBe("2"));

    await userEvent.click(bell());
    expect(apiFetch).toHaveBeenCalledWith("/api/notifications/read", { method: "POST" });
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications"));

    const menu = screen.getByRole("menu");
    const links = menu.querySelectorAll("a");
    expect([...links].map((a) => a.textContent)).toEqual([
      expect.stringContaining('Eve sent a message: "hello all"'),
      expect.stringContaining('Dana updated "Fix login"'),
    ]);
    expect(links[0]?.getAttribute("href")).toBe(`/projects/${PROJECT_ID}?workspace=${WORKSPACE_ID}`);
  });

  it("doesn't call mark-read when there's nothing unread, and closes on Escape", async () => {
    mockApi({ notifications: [], unreadCount: 0 });
    renderWithStore(<NotificationBell />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    await userEvent.click(bell());
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("bumps the badge for a live notification", async () => {
    mockApi({ notifications: [], unreadCount: 0 });
    const { store } = renderWithStore(<NotificationBell />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());

    act(() => {
      store.dispatch(notificationReceived(makeNotification("New task")));
    });
    expect(bell().getAttribute("aria-label")).toBe("Notifications (1 unread)");
  });
});

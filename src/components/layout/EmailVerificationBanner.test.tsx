import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { AppHeader } from "./AppHeader";
import { apiFetch, ApiError } from "@/lib/client-api";
import { renderWithStore } from "@/test/render";
import { makeUser } from "@/test/factories";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

function resendButton(): HTMLButtonElement | null {
  return screen.queryByRole("button", { name: "Resend email" });
}

describe("EmailVerificationBanner", () => {
  it("resends the verification email", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ message: "Verification email sent." });
    renderWithStore(<EmailVerificationBanner email="alice@example.com" />);

    expect(screen.getByText("alice@example.com")).toBeTruthy();
    await userEvent.click(resendButton()!);
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/resend-verification", { method: "POST" });
    expect((await screen.findByRole("status")).textContent).toContain("Check your inbox");
    expect(resendButton()).toBeNull();
  });

  it("shows the rate-limit message and keeps the button", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(429, "Too many emails sent. Try again in an hour."));
    renderWithStore(<EmailVerificationBanner email="alice@example.com" />);

    await userEvent.click(resendButton()!);
    expect((await screen.findByRole("alert")).textContent).toContain("Try again in an hour");
    expect(resendButton()?.disabled).toBe(false);
  });
});

describe("AppHeader", () => {
  it("shows the banner only to unverified users", () => {
    // The header's NotificationBell loads notifications on mount.
    vi.mocked(apiFetch).mockResolvedValue({ notifications: [], unreadCount: 0 });
    const { unmount } = renderWithStore(<AppHeader user={makeUser("Alice", { emailVerifiedAt: null })} />);
    expect(resendButton()).toBeTruthy();
    unmount();

    renderWithStore(<AppHeader user={makeUser("Bob")} />);
    expect(resendButton()).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyEmailForm } from "./VerifyEmailForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import { renderWithStore } from "@/test/render";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  replace.mockReset();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("VerifyEmailForm", () => {
  it("waits for a click, then sends the fragment's token and strips it from the address bar", async () => {
    window.history.replaceState(null, "", "/verify-email#token=verify_123-XYZ");
    vi.mocked(apiFetch).mockResolvedValue({ message: "Email verified." });
    renderWithStore(<VerifyEmailForm />);

    const button = await screen.findByRole("button", { name: "Confirm my email" });
    // Opening the link alone verifies nothing (mail scanners open links).
    expect(apiFetch).not.toHaveBeenCalled();

    await userEvent.click(button);
    expect(replace).toHaveBeenCalledWith("/verify-email", { scroll: false });
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "verify_123-XYZ" }),
    });
    expect((await screen.findByRole("status")).textContent).toContain("Your email is verified");
    expect(screen.getByRole("link", { name: "Continue to FlowSync" }).getAttribute("href")).toBe("/dashboard");
  });

  it("shows the API's error, and lets the user try again", async () => {
    window.history.replaceState(null, "", "/verify-email#token=old");
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError(400, "This verification link is invalid or has expired. Log in to get a new one."),
    );
    renderWithStore(<VerifyEmailForm />);

    await userEvent.click(await screen.findByRole("button", { name: "Confirm my email" }));
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm my email" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explains how to get a link when there's no token", async () => {
    window.history.replaceState(null, "", "/verify-email");
    renderWithStore(<VerifyEmailForm />);

    expect(await screen.findByText(/needs the link from your verification email/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import userEvent from "@testing-library/user-event";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { apiFetch, ApiError } from "@/lib/client-api";
import { renderWithStore } from "@/test/render";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
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

async function fill(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText("New password"), password);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Set new password" }));
}

describe("ResetPasswordForm", () => {
  it("sends the token from the URL fragment, strips it from the address bar, and goes to login", async () => {
    window.history.replaceState(null, "", "/reset-password#token=abc_123-XYZ");
    vi.mocked(apiFetch).mockResolvedValue({ message: "ok" });
    renderWithStore(<ResetPasswordForm />);

    await screen.findByLabelText("New password");
    // The token leaves the address bar through the Next.js router.
    expect(replace).toHaveBeenCalledWith("/reset-password", { scroll: false });

    await fill("brand-new-pass");
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "abc_123-XYZ", password: "brand-new-pass" }),
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?reset=1"));
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the token when the effect runs twice (React Strict Mode, as in dev)", async () => {
    window.history.replaceState(null, "", "/reset-password#token=strict-token");
    // StrictMode outermost, as Next.js wraps the app: only then does React
    // run the effect twice (StrictMode nested inside <Provider> didn't).
    render(
      <StrictMode>
        <Provider store={makeStore()}>
          <ResetPasswordForm />
        </Provider>
      </StrictMode>,
    );
    await screen.findByLabelText("New password");
    expect(screen.queryByText(/needs the link from your reset email/)).toBeNull();
  });

  it("catches mismatched passwords without calling the API", async () => {
    window.history.replaceState(null, "", "/reset-password#token=abc");
    renderWithStore(<ResetPasswordForm />);
    await screen.findByLabelText("New password");

    await fill("brand-new-pass", "brand-new-typo");
    expect(screen.getByText("The two passwords don't match")).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("offers a new link when the token is rejected", async () => {
    window.history.replaceState(null, "", "/reset-password#token=old");
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError(400, "This reset link is invalid or has expired. Request a new one."),
    );
    renderWithStore(<ResetPasswordForm />);
    await screen.findByLabelText("New password");

    await fill("brand-new-pass");
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe("/forgot-password");
    expect(replace).not.toHaveBeenCalled();
  });

  it("explains what's missing when opened without a token", async () => {
    window.history.replaceState(null, "", "/reset-password");
    renderWithStore(<ResetPasswordForm />);
    expect(await screen.findByText(/needs the link from your reset email/)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

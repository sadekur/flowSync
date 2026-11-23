import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import { apiFetch } from "@/lib/client-api";
import { connected, roomJoined, socketConnect } from "@/store/socketSlice";
import { typingStarted } from "@/store/presenceSlice";
import { messagesReceived } from "@/store/messagesSlice";
import { latestSocket } from "@/test/fakeSocket";
import { makeMessage, makeUser, PROJECT_ID, WORKSPACE_ID } from "@/test/factories";
import { renderWithStore } from "@/test/render";
import type { Message } from "@/types/api";

vi.mock("socket.io-client", () => import("@/test/fakeSocket"));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiFetch: vi.fn(),
}));

const me = makeUser("Me");
const bob = makeUser("Bob");
const carol = makeUser("Carol");
const BASE = `/api/workspaces/${WORKSPACE_ID}/projects/${PROJECT_ID}/messages`;

function renderChat(initialMessages: Message[] = [], initialHasOlder = false) {
  return renderWithStore(
    <ChatPanel
      workspaceId={WORKSPACE_ID}
      projectId={PROJECT_ID}
      currentUserId={me._id}
      members={[me, bob, carol]}
      initialMessages={initialMessages}
      initialHasOlder={initialHasOlder}
    />,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("ChatPanel", () => {
  it("renders the server-fetched messages, as plain text", () => {
    renderChat([
      makeMessage({ _id: bob._id, name: "Bob" }, "<b>not bold</b>"),
      makeMessage({ _id: me._id, name: "Me" }, "my reply"),
      makeMessage(null, "from a deleted account"),
    ]);
    // Escaped: shown literally, never turned into markup.
    const bobsMessage = screen.getByText("<b>not bold</b>");
    expect(bobsMessage.querySelector("b")).toBeNull();
    expect(screen.getByText(/^Bob ·/)).toBeTruthy();
    expect(screen.getByText(/^You ·/)).toBeTruthy();
    expect(screen.getByText(/^Deleted user ·/)).toBeTruthy();
  });

  it("shows an empty state", () => {
    renderChat();
    expect(screen.getByText("No messages yet. Say hello!")).toBeTruthy();
  });

  it("catches up on messages missed before joining the room", async () => {
    const first = makeMessage({ _id: bob._id, name: "Bob" }, "first");
    const missed = makeMessage({ _id: bob._id, name: "Bob" }, "missed while away");
    vi.mocked(apiFetch).mockResolvedValue({ messages: [missed], hasMore: false });
    const { store } = renderChat([first]);

    act(() => {
      store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [] }));
    });
    expect(await screen.findByText("missed while away")).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith(`${BASE}?after=${first._id}&limit=50`);
  });

  it("loads older messages on request", async () => {
    const current = makeMessage({ _id: bob._id, name: "Bob" }, "current");
    const older = makeMessage({ _id: bob._id, name: "Bob" }, "older", { _id: "000000000000000000000001" });
    vi.mocked(apiFetch).mockResolvedValue({ messages: [older], hasMore: false });
    renderChat([current], true);

    await userEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(apiFetch).toHaveBeenCalledWith(`${BASE}?before=${current._id}`);
    await screen.findByText("older");
    const texts = screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(texts).toEqual(["older", "current"]);
    expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
  });

  it("names who is typing, never the current user", () => {
    const { store } = renderChat();
    act(() => {
      store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [] }));
      store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: me._id }));
    });
    expect(screen.queryByText(/typing/)).toBeNull();

    act(() => {
      store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: bob._id }));
    });
    expect(screen.getByText("Bob is typing…")).toBeTruthy();

    act(() => {
      store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: carol._id }));
    });
    expect(screen.getByText("Bob, Carol are typing…")).toBeTruthy();
  });

  it("can't send until the socket is connected", () => {
    renderChat();
    expect(screen.getByPlaceholderText("Connecting…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends over the socket, shows the acked message and clears the input", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: false });
    const { store } = renderChat();
    act(() => {
      store.dispatch(socketConnect());
      latestSocket().serverAccept();
    });

    const input = screen.getByRole("textbox", { name: "Message" }) as HTMLInputElement;
    await userEvent.type(input, "  hello team  ");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    const sent = latestSocket().lastEmit("message:send");
    expect(sent.payload).toEqual({ projectId: PROJECT_ID, text: "hello team" });
    act(() => {
      sent.ack({ ok: true, message: makeMessage({ _id: me._id, name: "Me" }, "hello team") });
    });

    expect(await screen.findByText("hello team")).toBeTruthy();
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("keeps the draft and shows the error when a send fails", async () => {
    const { store } = renderChat();
    act(() => {
      store.dispatch(socketConnect());
      latestSocket().serverAccept();
    });

    const input = screen.getByRole("textbox", { name: "Message" }) as HTMLInputElement;
    await userEvent.type(input, "too fast");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    act(() => {
      latestSocket().lastEmit("message:send").ack({ ok: false, error: "You're sending messages too fast" });
    });

    expect(await screen.findByText("You're sending messages too fast")).toBeTruthy();
    expect(input.value).toBe("too fast");
  });

  it("shows live messages arriving for this project", () => {
    const { store } = renderChat();
    act(() => {
      store.dispatch(connected());
      store.dispatch(
        messagesReceived({ projectId: PROJECT_ID, messages: [makeMessage({ _id: bob._id, name: "Bob" }, "live!")] }),
      );
    });
    expect(screen.getByText("live!")).toBeTruthy();
  });
});

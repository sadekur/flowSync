import { describe, expect, it } from "vitest";
import { act, screen } from "@testing-library/react";
import { PresenceList } from "./PresenceList";
import { connected, disconnected, roomJoined } from "@/store/socketSlice";
import { userOffline, userOnline } from "@/store/presenceSlice";
import { makeUser, PROJECT_ID } from "@/test/factories";
import { renderWithStore } from "@/test/render";

const me = makeUser("Me");
const bob = makeUser("Bob");
const carol = makeUser("Carol");

function renderList() {
  return renderWithStore(<PresenceList projectId={PROJECT_ID} members={[me, bob, carol]} currentUserId={me._id} />);
}

describe("PresenceList", () => {
  it("shows nothing until the room is joined", () => {
    const { container } = renderList();
    expect(container.innerHTML).toBe("");
  });

  it("lists the other members who are online, and follows live changes", () => {
    const { store } = renderList();
    act(() => {
      store.dispatch(connected());
      store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [me._id, bob._id] }));
    });
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.queryByText("Me")).toBeNull();
    expect(screen.queryByText("Carol")).toBeNull();

    act(() => {
      store.dispatch(userOnline({ projectId: PROJECT_ID, userId: carol._id }));
      store.dispatch(userOffline({ projectId: PROJECT_ID, userId: bob._id }));
    });
    expect(screen.getByText("Carol")).toBeTruthy();
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("says when no one else is here, and hides again after a disconnect", () => {
    const { store, container } = renderList();
    act(() => {
      store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [me._id] }));
    });
    expect(screen.getByText("No one else is viewing this project right now.")).toBeTruthy();

    act(() => {
      store.dispatch(disconnected({ willReconnect: true }));
    });
    expect(container.innerHTML).toBe("");
  });
});

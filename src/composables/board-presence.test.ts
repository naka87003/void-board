import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useBoardPresence } from "./board-presence";

const peer = "00000000-0000-4000-8000-000000000001";
const otherPeer = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";

afterEach(() => {
  vi.useRealTimers();
});

describe("board presence", () => {
  it("batches outgoing cursor and drag updates using their latest positions", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const presence = useBoardPresence(send, () => "Guest");
    const latest = { x: 30, y: 40 };

    presence.setCursor({ x: 10, y: 20 });
    presence.setDrag({ id, x: 10, y: 20 });
    presence.setCursor(latest);
    presence.setDrag({ id, ...latest });

    expect(send).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();

    expect(send.mock.calls).toEqual([
      [{ type: "presence.cursor", name: "Guest", cursor: latest }],
      [{ type: "presence.drag", id, ...latest }],
    ]);
  });

  it("discards a queued drag preview after the drag ends", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const presence = useBoardPresence(send, () => "Guest");

    presence.setDrag({ id, x: 10, y: 20 });
    presence.endDrag();
    vi.runOnlyPendingTimers();

    expect(send).not.toHaveBeenCalled();
  });

  it("uses the latest remote drag and clears a preview when its move is saved", () => {
    const presence = useBoardPresence(
      () => true,
      () => "Guest",
    );
    const first = { type: "presence.drag", peer, id, x: 10, y: 20 } as const;
    const latest = { ...first, peer: otherPeer, x: 30 };

    presence.receive(first);
    presence.receive(latest);
    expect(presence.notePreviews.value.get(id)).toEqual(latest);

    presence.receive({
      type: "note.updated",
      note: { id, x: latest.x, y: latest.y, text: "An idea", color: "yellow" },
      movedBy: otherPeer,
    });
    expect(presence.notePreviews.value.get(id)).toEqual(first);

    presence.receive({ type: "note.removed", id });
    expect(presence.notePreviews.value.has(id)).toBe(false);
  });

  it("clears a departing peer's cursor and drag preview", () => {
    const presence = useBoardPresence(
      () => true,
      () => "Guest",
    );
    const cursor = {
      type: "presence.cursor",
      peer,
      name: "Guest",
      cursor: { x: 10, y: 20 },
    } as const;
    const drag = { type: "presence.drag", peer, id, x: 10, y: 20 } as const;

    presence.receive(cursor);
    presence.receive(drag);
    expect(presence.cursors.get(peer)).toEqual(cursor);
    expect(presence.notePreviews.value.get(id)).toEqual(drag);

    presence.receive({ type: "presence.left", peer });

    expect(presence.cursors.has(peer)).toBe(false);
    expect(presence.notePreviews.value.has(id)).toBe(false);
  });
});

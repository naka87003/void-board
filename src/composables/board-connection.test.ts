import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  clientMessage,
  DEFAULT_BOARD_TITLE,
  serverMessage,
  type Note,
  type ServerMessage,
} from "../../shared/board";
import { useBoardConnection } from "./board-connection";

const socket = vi.hoisted(() => ({ on: vi.fn(), send: vi.fn() }));
vi.mock("void/ws", () => ({ connect: () => socket }));
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onMounted: vi.fn(),
  onUnmounted: vi.fn(),
}));

const note = {
  kind: "note",
  id: "00000000-0000-4000-8000-000000000001",
  text: "An idea",
  color: "yellow",
  x: 10,
  y: 20,
} satisfies Note;
const peer = "00000000-0000-4000-8000-000000000002";
const first = { x: 30, y: 40 };
const second = { x: 50, y: 60 };
const firstRequestId = "00000000-0000-4000-8000-000000000003";
const secondRequestId = "00000000-0000-4000-8000-000000000004";
const syncRequestId = "00000000-0000-4000-8000-000000000005";
const nextSyncRequestId = "00000000-0000-4000-8000-000000000007";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(firstRequestId)
    .mockReturnValueOnce(secondRequestId)
    .mockReturnValueOnce(syncRequestId)
    .mockReturnValueOnce(nextSyncRequestId);
  socket.on.mockClear();
  socket.send.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function connectToBoard() {
  socket.send.mockImplementation((message: unknown) => clientMessage.parse(message));

  const onError = vi.fn();
  const onRemove = vi.fn();
  const onSyncError = vi.fn();
  const connection = useBoardConnection("board", () => "Guest", {
    onSnapshot: vi.fn(),
    onDisconnect: vi.fn(),
    onSave: vi.fn(),
    onRemove,
    onSyncError,
    onError,
  });
  connection.connectBoard();
  const receive: (message: ServerMessage) => void = socket.on.mock.calls.find(
    ([event]) => event === "message",
  )![1];
  const close: () => void = socket.on.mock.calls.find(([event]) => event === "close")![1];
  const receiveMessage = (message: ServerMessage) => receive(serverMessage.parse(message));
  receiveMessage({ type: "board.snapshot", title: DEFAULT_BOARD_TITLE, items: [note] });
  return { ...connection, receive: receiveMessage, close, onError, onRemove, onSyncError };
}

it("updates the title from both live renames and reconnect snapshots", () => {
  const { items, title, receive, close } = connectToBoard();
  expect(title.value).toBe(DEFAULT_BOARD_TITLE);

  receive({ type: "board.title", title: "Planning" });
  expect(title.value).toBe("Planning");
  expect(items.value).toEqual([note]);

  close();
  receive({ type: "board.snapshot", title: "Retrospective", items: [note] });
  expect(title.value).toBe("Retrospective");
});

it("reports a correlated removal acknowledgement separately from peer removal events", () => {
  const { items, onRemove, receive, sendMessage } = connectToBoard();
  const request = { type: "item.remove", id: note.id, requestId: firstRequestId } as const;
  expect(sendMessage(request)).toBe(true);
  expect(socket.send).toHaveBeenLastCalledWith(request);
  expect(items.value).toEqual([note]);
  expect(onRemove).not.toHaveBeenCalled();

  receive({ type: "item.removed", id: note.id });
  expect(items.value).toEqual([]);
  expect(onRemove).not.toHaveBeenCalled();

  receive({ type: "item.removed", id: note.id, requestId: firstRequestId });
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(firstRequestId);
});

describe("pending item moves", () => {
  it("keeps the latest move visible until its own acknowledgement arrives", () => {
    const { items, pendingPosition, receive, moveItem, onSyncError } = connectToBoard();
    expect(moveItem(note.id, first)).toBe(true);
    expect(socket.send).toHaveBeenLastCalledWith({
      type: "item.move",
      id: note.id,
      ...first,
      requestId: firstRequestId,
    });
    expect(pendingPosition(note.id)).toEqual(first);
    expect(items.value[0]).toEqual(note);

    moveItem(note.id, second);
    receive({ type: "item.updated", item: { ...note, text: "Edited" } });
    receive({
      type: "item.updated",
      item: { ...note, x: first.x, y: first.y, text: "Edited" },
      movedBy: peer,
      requestId: firstRequestId,
    });
    expect(pendingPosition(note.id)).toEqual(second);

    const saved = { ...note, x: second.x, y: second.y, text: "Edited" };
    receive({ type: "item.updated", item: saved, movedBy: peer, requestId: secondRequestId });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(items.value[0]).toEqual(saved);
    vi.advanceTimersByTime(10_000);
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("clears the pending position on a matching error or disconnect", () => {
    const { close, items, onError, pendingPosition, receive, moveItem, onSyncError } =
      connectToBoard();
    moveItem(note.id, first);
    moveItem(note.id, second);
    receive({ type: "board.error", reason: "storage", requestId: firstRequestId });
    expect(pendingPosition(note.id)).toEqual(second);
    receive({ type: "board.error", reason: "storage", requestId: secondRequestId });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(onError).toHaveBeenLastCalledWith("storage");
    expect(items.value[0]).toEqual(note);

    moveItem(note.id, first);
    close();
    expect(moveItem(note.id, second)).toBe(false);
    expect(pendingPosition(note.id)).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("keeps the latest position visible until the refresh arrives", () => {
    const { moveItem, items, onSyncError, pendingPosition, receive } = connectToBoard();
    moveItem(note.id, first);
    vi.advanceTimersByTime(5_000);
    moveItem(note.id, second);

    vi.advanceTimersByTime(5_000);
    expect(pendingPosition(note.id)).toEqual(second);
    expect(onSyncError).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(pendingPosition(note.id)).toEqual(second);
    expect(socket.send).toHaveBeenLastCalledWith({ type: "board.sync", requestId: syncRequestId });
    expect(onSyncError).not.toHaveBeenCalled();

    const saved = { ...note, ...second };
    receive({
      type: "board.snapshot",
      title: DEFAULT_BOARD_TITLE,
      items: [saved],
      requestId: syncRequestId,
    });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(items.value[0]).toEqual(saved);
    vi.advanceTimersByTime(5_000);
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("refreshes a move separately if it times out during an earlier refresh", () => {
    const other = { ...note, id: "00000000-0000-4000-8000-000000000006" };
    const { moveItem, pendingPosition, receive } = connectToBoard();
    receive({ type: "board.snapshot", title: DEFAULT_BOARD_TITLE, items: [note, other] });
    moveItem(note.id, first);
    vi.advanceTimersByTime(2_000);
    moveItem(other.id, second);
    vi.advanceTimersByTime(10_000);
    expect(socket.send).toHaveBeenLastCalledWith({ type: "board.sync", requestId: syncRequestId });

    receive({
      type: "board.snapshot",
      title: DEFAULT_BOARD_TITLE,
      items: [note, other],
      requestId: syncRequestId,
    });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(pendingPosition(other.id)).toEqual(second);
    expect(socket.send).toHaveBeenLastCalledWith({
      type: "board.sync",
      requestId: nextSyncRequestId,
    });
  });

  it.each(["server error", "timeout"])("allows another move after a refresh %s", (failure) => {
    const { moveItem, items, onError, onSyncError, pendingPosition, receive } = connectToBoard();
    moveItem(note.id, first);
    vi.advanceTimersByTime(10_000);
    expect(pendingPosition(note.id)).toEqual(first);

    if (failure === "server error") {
      receive({ type: "board.error", reason: "storage", requestId: secondRequestId });
    } else {
      vi.advanceTimersByTime(5_000);
    }

    expect(onSyncError).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(socket.send).toHaveBeenCalledTimes(2);

    receive({
      type: "board.snapshot",
      title: DEFAULT_BOARD_TITLE,
      items: [{ ...note, ...first }],
      requestId: secondRequestId,
    });
    expect(items.value[0]).toEqual(note);

    expect(moveItem(note.id, second)).toBe(true);
    const saved = { ...note, ...second, text: "Edited" };
    receive({ type: "item.updated", item: saved, movedBy: peer, requestId: syncRequestId });
    expect(items.value[0]).toEqual(saved);
    expect(pendingPosition(note.id)).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { clientMessage, serverMessage, type Note, type ServerMessage } from "../../shared/board";
import { useBoardConnection } from "./board-connection";

const socket = vi.hoisted(() => ({ on: vi.fn(), send: vi.fn() }));
vi.mock("void/ws", () => ({ connect: () => socket }));
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onMounted: vi.fn(),
  onUnmounted: vi.fn(),
}));

const note = {
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
  const onSyncError = vi.fn();
  const connection = useBoardConnection("board", () => "Guest", {
    onSnapshot: vi.fn(),
    onDisconnect: vi.fn(),
    onSave: vi.fn(),
    onSyncError,
    onError,
  });
  connection.connectBoard();
  const receive: (message: ServerMessage) => void = socket.on.mock.calls.find(
    ([event]) => event === "message",
  )![1];
  const close: () => void = socket.on.mock.calls.find(([event]) => event === "close")![1];
  const receiveMessage = (message: ServerMessage) => receive(serverMessage.parse(message));
  receiveMessage({ type: "board.snapshot", notes: [note] });
  return { ...connection, receive: receiveMessage, close, onError, onSyncError };
}

describe("pending note moves", () => {
  it("keeps the latest move visible until its own acknowledgement arrives", () => {
    const { notes, pendingPosition, receive, moveNote, onSyncError } = connectToBoard();
    expect(moveNote(note.id, first)).toBe(true);
    expect(socket.send).toHaveBeenLastCalledWith({
      type: "note.move",
      id: note.id,
      ...first,
      requestId: firstRequestId,
    });
    expect(pendingPosition(note.id)).toEqual(first);
    expect(notes.value[0]).toEqual(note);

    moveNote(note.id, second);
    receive({ type: "note.updated", note: { ...note, text: "Edited" } });
    receive({
      type: "note.updated",
      note: { ...note, x: first.x, y: first.y, text: "Edited" },
      movedBy: peer,
      requestId: firstRequestId,
    });
    expect(pendingPosition(note.id)).toEqual(second);

    const saved = { ...note, x: second.x, y: second.y, text: "Edited" };
    receive({ type: "note.updated", note: saved, movedBy: peer, requestId: secondRequestId });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(notes.value[0]).toEqual(saved);
    vi.advanceTimersByTime(10_000);
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("clears the pending position on a matching error or disconnect", () => {
    const { close, notes, onError, pendingPosition, receive, moveNote, onSyncError } =
      connectToBoard();
    moveNote(note.id, first);
    moveNote(note.id, second);
    receive({ type: "board.error", reason: "storage", requestId: firstRequestId });
    expect(pendingPosition(note.id)).toEqual(second);
    receive({ type: "board.error", reason: "storage", requestId: secondRequestId });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(onError).toHaveBeenLastCalledWith("storage");
    expect(notes.value[0]).toEqual(note);

    moveNote(note.id, first);
    close();
    expect(moveNote(note.id, second)).toBe(false);
    expect(pendingPosition(note.id)).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("keeps the latest position visible until the refresh arrives", () => {
    const { moveNote, notes, onSyncError, pendingPosition, receive } = connectToBoard();
    moveNote(note.id, first);
    vi.advanceTimersByTime(5_000);
    moveNote(note.id, second);

    vi.advanceTimersByTime(5_000);
    expect(pendingPosition(note.id)).toEqual(second);
    expect(onSyncError).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(pendingPosition(note.id)).toEqual(second);
    expect(socket.send).toHaveBeenLastCalledWith({ type: "board.sync", requestId: syncRequestId });
    expect(onSyncError).not.toHaveBeenCalled();

    const saved = { ...note, ...second };
    receive({ type: "board.snapshot", notes: [saved], requestId: syncRequestId });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(notes.value[0]).toEqual(saved);
    vi.advanceTimersByTime(5_000);
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("refreshes a move separately if it times out during an earlier refresh", () => {
    const other = { ...note, id: "00000000-0000-4000-8000-000000000006" };
    const { moveNote, pendingPosition, receive } = connectToBoard();
    receive({ type: "board.snapshot", notes: [note, other] });
    moveNote(note.id, first);
    vi.advanceTimersByTime(2_000);
    moveNote(other.id, second);
    vi.advanceTimersByTime(10_000);
    expect(socket.send).toHaveBeenLastCalledWith({ type: "board.sync", requestId: syncRequestId });

    receive({ type: "board.snapshot", notes: [note, other], requestId: syncRequestId });
    expect(pendingPosition(note.id)).toBeUndefined();
    expect(pendingPosition(other.id)).toEqual(second);
    expect(socket.send).toHaveBeenLastCalledWith({
      type: "board.sync",
      requestId: nextSyncRequestId,
    });
  });

  it.each(["server error", "timeout"])("allows another move after a refresh %s", (failure) => {
    const { moveNote, notes, onError, onSyncError, pendingPosition, receive } = connectToBoard();
    moveNote(note.id, first);
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

    receive({ type: "board.snapshot", notes: [{ ...note, ...first }], requestId: secondRequestId });
    expect(notes.value[0]).toEqual(note);

    expect(moveNote(note.id, second)).toBe(true);
    const saved = { ...note, ...second, text: "Edited" };
    receive({ type: "note.updated", note: saved, movedBy: peer, requestId: syncRequestId });
    expect(notes.value[0]).toEqual(saved);
    expect(pendingPosition(note.id)).toBeUndefined();
  });
});

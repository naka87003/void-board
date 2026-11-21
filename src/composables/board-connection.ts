import { connect } from "void/ws";
import { onMounted, onUnmounted, ref, shallowReactive } from "vue";
import type { ClientMessage, Note, ServerMessage } from "../../shared/board";
import { useBoardPresence } from "./board-presence";

type BoardError = Extract<ServerMessage, { type: "board.error" }>["reason"];
type Position = Pick<Note, "x" | "y">;
type Timer = ReturnType<typeof setTimeout>;
type PendingMove = { position: Position; requestId: string; saveTimer: Timer | undefined };

const moveTimeout = 10_000;
const syncTimeout = 5_000;

export function useBoardConnection(
  board: string | null,
  displayName: () => string,
  callbacks: {
    onSnapshot: () => void;
    onDisconnect: () => void;
    onSave: (requestId: string, note: Note) => void;
    onSyncError: () => void;
    onError: (reason: BoardError, requestId?: string) => void;
  },
) {
  const status = ref<"connecting" | "ready" | "disconnected">("connecting");
  const notes = ref<Note[]>([]);
  const pendingMoves = shallowReactive(new Map<string, PendingMove>());
  let sync: { requestId: string; timer: Timer; moves: [string, PendingMove][] } | undefined;
  let socket: ReturnType<typeof connect<"/boards/[board]">> | undefined;
  const presence = useBoardPresence(sendMessage, displayName);

  function connectBoard() {
    if (!board || !displayName() || socket) return;

    socket = connect("/boards/[board]", { params: { board } });
    socket.on("message", (message) => {
      presence.receive(message);
      switch (message.type) {
        case "board.snapshot":
          if (message.requestId && message.requestId !== sync?.requestId) break;
          notes.value = message.notes;
          status.value = "ready";
          if (message.requestId) finishSync();
          callbacks.onSnapshot();
          break;
        case "note.updated": {
          const index = notes.value.findIndex((note) => note.id === message.note.id);
          if (index === -1) {
            notes.value.push(message.note);
          } else {
            notes.value[index] = message.note;
          }
          if (message.movedBy) {
            const pending = pendingMoves.get(message.note.id);
            if (pending && pending.requestId === message.requestId) {
              clearMove(message.note.id);
            }
          } else if (message.requestId) {
            callbacks.onSave(message.requestId, message.note);
          }
          break;
        }
        case "note.removed":
          clearMove(message.id);
          notes.value = notes.value.filter((note) => note.id !== message.id);
          break;
        case "board.error": {
          if (sync && message.requestId === sync.requestId) {
            failSync();
            break;
          }
          for (const [id, pending] of pendingMoves) {
            if (pending.requestId !== message.requestId) continue;
            clearMove(id);
            callbacks.onError(message.reason);
            return;
          }
          callbacks.onError(message.reason, message.requestId);
          break;
        }
      }
    });
    socket.on("close", () => {
      status.value = "disconnected";
      resetPendingRequests();
      presence.reset();
      callbacks.onDisconnect();
    });
  }

  function sendMessage(message: ClientMessage) {
    if (!socket || status.value !== "ready") return false;
    socket.send(message);
    return true;
  }

  function pendingPosition(id: string) {
    return pendingMoves.get(id)?.position;
  }

  function clearMove(id: string) {
    const pending = pendingMoves.get(id);
    if (!pending) return;
    clearTimeout(pending.saveTimer);
    pendingMoves.delete(id);
  }

  function resetPendingRequests() {
    clearTimeout(sync?.timer);
    sync = undefined;
    for (const id of pendingMoves.keys()) clearMove(id);
  }

  function syncBoard() {
    if (sync) return;
    const requestId = crypto.randomUUID();
    if (!sendMessage({ type: "board.sync", requestId })) return;

    // Include only moves whose save deadline passed before this request.
    const moves = Array.from(pendingMoves).filter(([, move]) => move.saveTimer === undefined);
    sync = { requestId, moves, timer: setTimeout(failSync, syncTimeout) };
  }

  function finishSync() {
    if (!sync) return;
    clearTimeout(sync.timer);
    for (const [id, move] of sync.moves) {
      if (pendingMoves.get(id) === move) clearMove(id);
    }
    sync = undefined;
    for (const move of pendingMoves.values()) {
      if (move.saveTimer !== undefined) continue;
      syncBoard();
      break;
    }
  }

  function failSync() {
    finishSync();
    callbacks.onSyncError();
  }

  function moveNote(id: string, { x, y }: Position) {
    const requestId = crypto.randomUUID();
    if (!sendMessage({ type: "note.move", id, x, y, requestId })) return false;

    clearMove(id);
    const saveTimer = setTimeout(() => {
      const move = pendingMoves.get(id);
      if (!move) return;
      move.saveTimer = undefined;
      syncBoard();
    }, moveTimeout);
    pendingMoves.set(id, { position: { x, y }, requestId, saveTimer });
    return true;
  }

  onMounted(connectBoard);
  onUnmounted(() => {
    resetPendingRequests();
    presence.reset();
    socket?.close();
  });

  return {
    status,
    notes,
    presence,
    connectBoard,
    sendMessage,
    moveNote,
    pendingPosition,
  };
}

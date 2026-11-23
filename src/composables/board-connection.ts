import { connect } from "void/ws";
import { onMounted, onUnmounted, ref, shallowReactive } from "vue";
import {
  DEFAULT_BOARD_TITLE,
  type BoardItem,
  type ClientMessage,
  type ServerMessage,
} from "../../shared/board";
import { useBoardPresence } from "./board-presence";

type BoardError = Extract<ServerMessage, { type: "board.error" }>["reason"];
type Position = Pick<BoardItem, "x" | "y">;
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
    onSave: (requestId: string, item: BoardItem) => void;
    onRemove: (requestId: string) => void;
    onSyncError: () => void;
    onError: (reason: BoardError, requestId?: string) => void;
  },
) {
  const status = ref<"connecting" | "ready" | "disconnected">("connecting");
  const title = ref(DEFAULT_BOARD_TITLE);
  const items = ref<BoardItem[]>([]);
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
          title.value = message.title;
          items.value = message.items;
          status.value = "ready";
          if (message.requestId) finishSync();
          callbacks.onSnapshot();
          break;
        case "board.title":
          title.value = message.title;
          break;
        case "item.updated": {
          const index = items.value.findIndex(({ id }) => id === message.item.id);
          if (index === -1) {
            items.value.push(message.item);
          } else {
            items.value[index] = message.item;
          }
          if (message.movedBy) {
            const pending = pendingMoves.get(message.item.id);
            if (pending && pending.requestId === message.requestId) {
              clearMove(message.item.id);
            }
          } else if (message.requestId) {
            callbacks.onSave(message.requestId, message.item);
          }
          break;
        }
        case "item.removed":
          clearMove(message.id);
          items.value = items.value.filter(({ id }) => id !== message.id);
          if (message.requestId) callbacks.onRemove(message.requestId);
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

  function moveItem(id: string, { x, y }: Position) {
    const requestId = crypto.randomUUID();
    if (!sendMessage({ type: "item.move", id, x, y, requestId })) return false;

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
    title,
    items,
    presence,
    connectBoard,
    sendMessage,
    moveItem,
    pendingPosition,
  };
}

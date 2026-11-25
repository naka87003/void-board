import { connect } from "void/ws";
import { onMounted, onUnmounted, ref, shallowReactive, toValue, type MaybeRefOrGetter } from "vue";
import {
  DEFAULT_BOARD_TITLE,
  type BoardItem,
  type ClientMessage,
  type ItemPosition,
  type LineGeometry,
  type ServerMessage,
} from "../../shared/board";
import { useBoardPresence } from "./board-presence";

type BoardError = Extract<ServerMessage, { type: "board.error" }>["reason"];
type Timer = ReturnType<typeof setTimeout>;
type PendingPosition = { position: ItemPosition; requestId: string; saveTimer: Timer | undefined };

const positionSaveTimeout = 10_000;
const syncTimeout = 5_000;

export function useBoardConnection(
  board: string | null,
  displayName: MaybeRefOrGetter<string>,
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
  const pendingPositions = shallowReactive(new Map<string, PendingPosition>());
  let sync: { requestId: string; timer: Timer; positions: [string, PendingPosition][] } | undefined;
  let socket: ReturnType<typeof connect<"/boards/[board]">> | undefined;
  const presence = useBoardPresence(sendMessage, displayName);

  function connectBoard() {
    if (!board || !toValue(displayName) || socket) return;

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
            const pending = pendingPositions.get(message.item.id);
            if (pending && pending.requestId === message.requestId) {
              clearPendingPosition(message.item.id);
            }
          } else if (message.requestId) {
            callbacks.onSave(message.requestId, message.item);
          }
          break;
        }
        case "item.removed":
          clearPendingPosition(message.id);
          items.value = items.value.filter(({ id }) => id !== message.id);
          if (message.requestId) callbacks.onRemove(message.requestId);
          break;
        case "board.error": {
          if (sync && message.requestId === sync.requestId) {
            failSync();
            break;
          }
          for (const [id, pending] of pendingPositions) {
            if (pending.requestId !== message.requestId) continue;
            clearPendingPosition(id);
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
    return pendingPositions.get(id)?.position;
  }

  function clearPendingPosition(id: string) {
    const pending = pendingPositions.get(id);
    if (!pending) return;
    clearTimeout(pending.saveTimer);
    pendingPositions.delete(id);
  }

  function resetPendingRequests() {
    clearTimeout(sync?.timer);
    sync = undefined;
    for (const id of pendingPositions.keys()) clearPendingPosition(id);
  }

  function syncBoard() {
    if (sync) return;
    const requestId = crypto.randomUUID();
    if (!sendMessage({ type: "board.sync", requestId })) return;

    // Include only position changes whose save deadline passed before this request.
    const positions = Array.from(pendingPositions).filter(
      ([, pending]) => pending.saveTimer === undefined,
    );
    sync = { requestId, positions, timer: setTimeout(failSync, syncTimeout) };
  }

  function finishSync() {
    if (!sync) return;
    clearTimeout(sync.timer);
    for (const [id, pending] of sync.positions) {
      if (pendingPositions.get(id) === pending) clearPendingPosition(id);
    }
    sync = undefined;
    for (const pending of pendingPositions.values()) {
      if (pending.saveTimer !== undefined) continue;
      syncBoard();
      break;
    }
  }

  function failSync() {
    finishSync();
    callbacks.onSyncError();
  }

  function moveItem(id: string, { x, y }: ItemPosition) {
    return savePosition({ type: "item.move", id, x, y, requestId: crypto.randomUUID() }, { x, y });
  }

  function resizeItem(id: string, geometry: LineGeometry, base: LineGeometry) {
    return savePosition(
      { type: "item.resize", id, geometry, base, requestId: crypto.randomUUID() },
      geometry,
    );
  }

  function savePosition(
    message: Extract<ClientMessage, { type: "item.move" | "item.resize" }> & { requestId: string },
    position: ItemPosition,
  ) {
    if (!sendMessage(message)) return false;
    const { id } = message;
    clearPendingPosition(id);
    const saveTimer = setTimeout(() => {
      const pending = pendingPositions.get(id);
      if (!pending) return;
      pending.saveTimer = undefined;
      syncBoard();
    }, positionSaveTimeout);
    pendingPositions.set(id, { position, requestId: message.requestId, saveTimer });
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
    resizeItem,
    pendingPosition,
  };
}

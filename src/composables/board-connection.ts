import { connect } from "void/ws";
import { onMounted, onUnmounted, ref } from "vue";
import type { ClientMessage, Note, ServerMessage } from "../../shared/board";
import { useBoardPresence } from "./board-presence";

type BoardError = Extract<ServerMessage, { type: "board.error" }>["reason"];

export function useBoardConnection(
  board: string | null,
  displayName: () => string,
  callbacks: {
    onSnapshot: () => void;
    onDisconnect: () => void;
    onSave: (requestId: string, note: Note) => void;
    onError: (reason: BoardError, requestId?: string) => void;
  },
) {
  const status = ref<"connecting" | "ready" | "disconnected">("connecting");
  const notes = ref<Note[]>([]);
  let socket: ReturnType<typeof connect<"/boards/[board]">> | undefined;
  const presence = useBoardPresence(sendMessage, displayName);

  function connectBoard() {
    if (!board || !displayName() || socket) return;

    socket = connect("/boards/[board]", { params: { board } });
    socket.on("message", (message) => {
      presence.receive(message);
      switch (message.type) {
        case "board.snapshot":
          notes.value = message.notes;
          status.value = "ready";
          callbacks.onSnapshot();
          break;
        case "note.updated": {
          const index = notes.value.findIndex((note) => note.id === message.note.id);
          if (index === -1) {
            notes.value.push(message.note);
          } else {
            notes.value[index] = message.note;
          }
          if (message.requestId) callbacks.onSave(message.requestId, message.note);
          break;
        }
        case "note.removed":
          notes.value = notes.value.filter((note) => note.id !== message.id);
          break;
        case "board.error":
          callbacks.onError(message.reason, message.requestId);
          break;
      }
    });
    socket.on("close", () => {
      status.value = "disconnected";
      presence.reset();
      callbacks.onDisconnect();
    });
  }

  function sendMessage(message: ClientMessage) {
    if (!socket || status.value !== "ready") return false;
    socket.send(message);
    return true;
  }

  onMounted(connectBoard);
  onUnmounted(() => {
    presence.reset();
    socket?.close();
  });

  return { status, notes, presence, connectBoard, sendMessage };
}

import { computed, reactive } from "vue";
import type { ClientMessage, Cursor, ServerMessage } from "../../shared/board";

type CursorMessage = Extract<ServerMessage, { type: "presence.cursor" }>;
type DragMessage = Extract<ServerMessage, { type: "presence.drag" }>;

const updateInterval = 40;
const cursorColors = ["#6341a2", "#23664d", "#9c385e", "#235c8f", "#8d4a1c"];

export function peerColor(peer: string) {
  return cursorColors[parseInt(peer.slice(0, 8), 16) % cursorColors.length];
}

export function useBoardPresence(send: (message: ClientMessage) => boolean, name: () => string) {
  const cursors = reactive(new Map<string, Omit<CursorMessage, "cursor"> & { cursor: Cursor }>());
  const drags = reactive(new Map<string, DragMessage>());
  const notePreviews = computed(
    () => new Map(Array.from(drags.values(), (drag) => [drag.id, drag])),
  );

  let cursor: Cursor | null = null;
  let drag: Omit<DragMessage, "peer" | "type"> | undefined;
  let cursorChanged = false;
  let dragChanged = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (cursorChanged) send({ type: "presence.cursor", cursor, name: name() });
    if (dragChanged && drag) send({ type: "presence.drag", ...drag });
    cursorChanged = false;
    dragChanged = false;
  }

  function schedule() {
    timer ??= setTimeout(flush, updateInterval);
  }

  function setCursor(position: Cursor | null) {
    if (cursor?.x === position?.x && cursor?.y === position?.y) return;
    cursor = position;
    cursorChanged = true;
    if (position) schedule();
    else flush();
  }

  function updateName() {
    if (cursor) send({ type: "presence.cursor", cursor, name: name() });
  }

  function setDrag(position: Omit<DragMessage, "peer" | "type">) {
    if (drag?.id === position.id && drag.x === position.x && drag.y === position.y) return;
    drag = position;
    dragChanged = true;
    schedule();
  }

  function endDrag() {
    drag = undefined;
    dragChanged = false;
  }

  function receive(message: ServerMessage) {
    switch (message.type) {
      case "presence.request":
        updateName();
        if (drag) send({ type: "presence.drag", ...drag });
        break;
      case "presence.cursor":
        if (message.cursor) cursors.set(message.peer, { ...message, cursor: message.cursor });
        else cursors.delete(message.peer);
        break;
      case "presence.drag":
        // Use the latest preview if two peers are dragging the same note.
        drags.delete(message.peer);
        drags.set(message.peer, message);
        break;
      case "presence.left":
        cursors.delete(message.peer);
        drags.delete(message.peer);
        break;
      case "presence.drag-cancelled":
        drags.delete(message.peer);
        break;
      case "note.updated":
        if (message.movedBy && drags.get(message.movedBy)?.id === message.note.id) {
          drags.delete(message.movedBy);
        }
        break;
      case "note.removed":
        for (const [peer, preview] of drags) {
          if (preview.id === message.id) drags.delete(peer);
        }
        break;
    }
  }

  function reset() {
    clearTimeout(timer);
    timer = undefined;
    cursor = null;
    cursorChanged = false;
    endDrag();
    cursors.clear();
    drags.clear();
  }

  return { cursors, notePreviews, setCursor, updateName, setDrag, endDrag, receive, reset };
}

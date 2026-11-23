import { ref, watch, type Ref } from "vue";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  type BoardItem,
} from "../../shared/board";
import type { useBoardConnection } from "./board-connection";

const arrowDirections: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function boundedPosition(x: number, y: number) {
  return {
    x: Math.round(Math.min(BOARD_WIDTH - NOTE_WIDTH, Math.max(0, x))),
    y: Math.round(Math.min(BOARD_HEIGHT - NOTE_HEIGHT, Math.max(0, y))),
  };
}

export function useBoardItemInteractions(
  viewport: Readonly<Ref<HTMLDivElement | null | undefined>>,
  {
    items,
    status,
    pendingPosition,
    presence,
    moveItem,
    sendMessage,
  }: Pick<
    ReturnType<typeof useBoardConnection>,
    "items" | "status" | "pendingPosition" | "presence" | "moveItem" | "sendMessage"
  >,
  {
    editItem,
    onMove,
  }: { editItem: (event: MouseEvent, item: BoardItem) => void; onMove: () => void },
) {
  const selectedItemId = ref<string>();
  const drag = ref<{
    id: string;
    pointer: number;
    origin: { x: number; y: number };
    offsetX: number;
    offsetY: number;
    start: Pick<BoardItem, "x" | "y">;
    moved: boolean;
    x: number;
    y: number;
  }>();
  let ignorePointerClick = false;
  let firstClickItemId: string | undefined;
  let lastTap: { id: string; time: number; x: number; y: number } | undefined;

  const { itemPreviews } = presence;

  watch(items, (currentItems) => {
    const active = drag.value;
    if (active && !currentItems.some((item) => item.id === active.id)) cancelDrag();
    if (selectedItemId.value && !currentItems.some((item) => item.id === selectedItemId.value)) {
      clearSelection();
    }
  });

  function resetDrag() {
    drag.value = undefined;
    lastTap = undefined;
  }

  function cancelDrag() {
    const active = drag.value;
    resetDrag();
    if (!active?.moved) return;
    presence.endDrag();
    sendMessage({ type: "presence.drag-cancelled" });
  }

  function clearSelection() {
    selectedItemId.value = undefined;
    firstClickItemId = undefined;
    lastTap = undefined;
  }

  function selectItem(event: MouseEvent, item: BoardItem) {
    if (event.detail !== 0 && ignorePointerClick) return;
    selectedItemId.value = item.id;
    if (event.detail === 0) {
      editItem(event, item);
    } else if (event.detail === 1) {
      firstClickItemId = item.id;
    }
  }

  function editOnDoubleClick(event: MouseEvent, item: BoardItem) {
    if (!ignorePointerClick && firstClickItemId === item.id) editItem(event, item);
  }

  function tapItem(event: PointerEvent, item: BoardItem) {
    const { clientX: x, clientY: y, timeStamp: time } = event;
    const previous = lastTap;
    selectedItemId.value = item.id;
    // Touch browsers can dispatch mouse clicks after pointerup.
    ignorePointerClick = true;
    firstClickItemId = undefined;
    if (
      previous?.id === item.id &&
      time - previous.time <= 400 &&
      Math.hypot(x - previous.x, y - previous.y) <= 24
    ) {
      lastTap = undefined;
      editItem(event, item);
    } else {
      lastTap = { id: item.id, time, x, y };
    }
  }

  function startDrag(event: PointerEvent, item: BoardItem) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      status.value !== "ready" ||
      drag.value ||
      !viewport.value
    )
      return;
    ignorePointerClick = false;
    if (event.pointerType !== "touch") lastTap = undefined;
    const bounds = viewport.value.getBoundingClientRect();
    const { x, y } = itemPosition(item);
    const button = event.currentTarget as HTMLElement;
    button.setPointerCapture(event.pointerId);
    drag.value = {
      id: item.id,
      pointer: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      offsetX: event.clientX - bounds.left + viewport.value.scrollLeft - x,
      offsetY: event.clientY - bounds.top + viewport.value.scrollTop - y,
      start: { x, y },
      moved: false,
      x,
      y,
    };
  }

  function updateDrag(event: PointerEvent) {
    const active = drag.value;
    if (!active || active.pointer !== event.pointerId || !viewport.value) return;
    if (!active.moved) {
      if (Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) < 5) return;
      active.moved = true;
      selectedItemId.value = active.id;
      // Pointer capture can produce a click on the item even after a drag.
      ignorePointerClick = true;
      firstClickItemId = undefined;
      lastTap = undefined;
    }
    const bounds = viewport.value.getBoundingClientRect();
    Object.assign(
      active,
      boundedPosition(
        event.clientX - bounds.left + viewport.value.scrollLeft - active.offsetX,
        event.clientY - bounds.top + viewport.value.scrollTop - active.offsetY,
      ),
    );
    const { id, x, y } = active;
    presence.setDrag({ id, x, y });
  }

  function finishDrag(event: PointerEvent, item: BoardItem) {
    const active = drag.value;
    if (!active || active.pointer !== event.pointerId) return;

    if (event.type === "pointerup") {
      updateDrag(event);
    } else {
      lastTap = undefined;
    }
    drag.value = undefined;
    if (!active.moved) {
      if (event.type === "pointerup" && event.pointerType === "touch") tapItem(event, item);
      return;
    }

    presence.endDrag();
    const previous =
      pendingPosition(active.id) ?? items.value.find((item) => item.id === active.id);
    if (
      event.type === "pointerup" &&
      previous &&
      (active.start.x !== active.x || active.start.y !== active.y) &&
      (previous.x !== active.x || previous.y !== active.y) &&
      moveItem(active.id, active)
    ) {
      onMove();
    } else {
      sendMessage({ type: "presence.drag-cancelled" });
    }
  }

  function itemPosition(item: BoardItem) {
    if (drag.value?.id === item.id && drag.value.moved) return drag.value;
    return pendingPosition(item.id) ?? itemPreviews.value.get(item.id) ?? item;
  }

  function moveWithKey(event: KeyboardEvent, item: BoardItem) {
    const delta = arrowDirections[event.key];
    if (!delta) return;

    event.preventDefault();
    const step = event.shiftKey ? 48 : 12;
    const { x, y } = pendingPosition(item.id) ?? item;
    if (moveItem(item.id, boundedPosition(x + delta[0] * step, y + delta[1] * step))) {
      selectedItemId.value = item.id;
      onMove();
    }
  }

  function isDragging(id: string) {
    return drag.value?.id === id && drag.value.moved;
  }

  function isRemoteDragging(id: string) {
    return drag.value?.id !== id && !pendingPosition(id) && itemPreviews.value.has(id);
  }

  return {
    selectedItemId,
    clearSelection,
    selectItem,
    editOnDoubleClick,
    startDrag,
    updateDrag,
    finishDrag,
    cancelDrag,
    resetDrag,
    itemPosition,
    isDragging,
    isRemoteDragging,
    moveWithKey,
  };
}

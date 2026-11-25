import { ref, watch, type Ref } from "vue";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LINE_INSET,
  itemPositionLimits,
  sameLineGeometry,
  validLineGeometry,
  type BoardItem,
  type BoardLine,
  type ItemPosition,
  type LineGeometry,
} from "../../shared/board";
import type { useBoardConnection } from "./board-connection";

const arrowDirections: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function boundedPosition(x: number, y: number, vector?: Pick<LineGeometry, "dx" | "dy">) {
  const { minX, minY, maxX, maxY } = itemPositionLimits(vector);
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, x))),
    y: Math.round(Math.min(maxY, Math.max(minY, y))),
  };
}

type LineEnd = "start" | "end";

function resizeLine(base: LineGeometry, end: LineEnd, x: number, y: number) {
  const point = {
    x: Math.round(Math.min(BOARD_WIDTH - LINE_INSET, Math.max(LINE_INSET, x))),
    y: Math.round(Math.min(BOARD_HEIGHT - LINE_INSET, Math.max(LINE_INSET, y))),
  };
  const geometry =
    end === "start"
      ? { ...point, dx: base.x + base.dx - point.x, dy: base.y + base.dy - point.y }
      : { x: base.x, y: base.y, dx: point.x - base.x, dy: point.y - base.y };
  return validLineGeometry(geometry) ? geometry : undefined;
}

export function useBoardItemInteractions(
  viewport: Readonly<Ref<HTMLDivElement | null | undefined>>,
  {
    items,
    status,
    pendingPosition,
    presence,
    moveItem,
    resizeItem,
    sendMessage,
  }: Pick<
    ReturnType<typeof useBoardConnection>,
    "items" | "status" | "pendingPosition" | "presence" | "moveItem" | "resizeItem" | "sendMessage"
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
    vector?: Pick<LineGeometry, "dx" | "dy">;
    moved: boolean;
    x: number;
    y: number;
  }>();
  const resize = ref<{
    id: string;
    pointer: number;
    end: LineEnd;
    base: LineGeometry;
    offsetX: number;
    offsetY: number;
    geometry: LineGeometry;
  }>();
  let ignorePointerClick = false;
  let firstClickItemId: string | undefined;
  let lastTap: { id: string; time: number; x: number; y: number } | undefined;

  const { itemPreviews } = presence;

  watch(items, (currentItems) => {
    const active = drag.value;
    if (active && !currentItems.some((item) => item.id === active.id)) cancelDrag();
    if (resize.value && !currentItems.some((item) => item.id === resize.value?.id)) {
      resize.value = undefined;
    }
    if (selectedItemId.value && !currentItems.some((item) => item.id === selectedItemId.value)) {
      clearSelection();
    }
  });

  function resetDrag() {
    drag.value = undefined;
    resize.value = undefined;
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
      resize.value ||
      pendingPosition(item.id)?.dx !== undefined ||
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
      vector: item.kind === "line" ? { dx: item.dx, dy: item.dy } : undefined,
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
        active.vector,
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
    // Capture can be lost after release without this item receiving pointerup.
    // In that case, keep the last drag position instead of using the capture event's coordinates.
    const releasedWithoutPointerUp =
      event.type === "lostpointercapture" && event.pointerType === "mouse" && event.buttons === 0;
    const previous =
      pendingPosition(active.id) ?? items.value.find((item) => item.id === active.id);
    if (
      (event.type === "pointerup" || releasedWithoutPointerUp) &&
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

  function itemPosition(item: BoardItem): ItemPosition {
    if (resize.value?.id === item.id) return resize.value.geometry;
    if (drag.value?.id === item.id && drag.value.moved) return drag.value;
    return pendingPosition(item.id) ?? itemPreviews.value.get(item.id) ?? item;
  }

  function pointerOnBoard(event: PointerEvent) {
    const element = viewport.value;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left - element.clientLeft + element.scrollLeft,
      y: event.clientY - bounds.top - element.clientTop + element.scrollTop,
    };
  }

  function startResize(event: PointerEvent, item: BoardLine, end: LineEnd) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      status.value !== "ready" ||
      drag.value ||
      resize.value ||
      pendingPosition(item.id) ||
      isRemoteDragging(item.id)
    )
      return;
    const point = pointerOnBoard(event);
    if (!point) return;
    const { x, y, dx, dy } = item;
    const base = { x, y, dx, dy };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    resize.value = {
      id: item.id,
      pointer: event.pointerId,
      end,
      base,
      offsetX: point.x - (end === "start" ? x : x + dx),
      offsetY: point.y - (end === "start" ? y : y + dy),
      geometry: base,
    };
  }

  function updateResize(event: PointerEvent) {
    const active = resize.value;
    if (active?.pointer !== event.pointerId) return;
    const point = pointerOnBoard(event);
    if (!point) return;
    const geometry = resizeLine(
      active.base,
      active.end,
      point.x - active.offsetX,
      point.y - active.offsetY,
    );
    if (geometry) active.geometry = geometry;
  }

  function finishResize(event: PointerEvent) {
    const active = resize.value;
    if (active?.pointer !== event.pointerId) return;
    if (event.type === "pointerup") updateResize(event);
    resize.value = undefined;
    if (
      event.type !== "pointerup" &&
      !(event.type === "lostpointercapture" && event.pointerType === "mouse" && event.buttons === 0)
    )
      return;
    if (
      !sameLineGeometry(active.base, active.geometry) &&
      resizeItem(active.id, active.geometry, active.base)
    )
      onMove();
  }

  function resizeWithKey(event: KeyboardEvent, item: BoardLine, end: LineEnd) {
    const delta = arrowDirections[event.key];
    if (!delta) return;
    event.preventDefault();
    if (
      status.value !== "ready" ||
      drag.value ||
      resize.value ||
      pendingPosition(item.id) ||
      isRemoteDragging(item.id)
    )
      return;
    const { x, y, dx, dy } = item;
    const base = { x, y, dx, dy };
    const step = event.shiftKey ? 48 : 12;
    const geometry = resizeLine(
      base,
      end,
      (end === "start" ? x : x + dx) + delta[0] * step,
      (end === "start" ? y : y + dy) + delta[1] * step,
    );
    if (geometry && !sameLineGeometry(geometry, base) && resizeItem(item.id, geometry, base))
      onMove();
  }

  function moveWithKey(event: KeyboardEvent, item: BoardItem) {
    const delta = arrowDirections[event.key];
    if (!delta) return;

    event.preventDefault();
    if (resize.value || pendingPosition(item.id)?.dx !== undefined) return;
    const step = event.shiftKey ? 48 : 12;
    const { x, y } = pendingPosition(item.id) ?? item;
    const vector = item.kind === "line" ? item : undefined;
    if (moveItem(item.id, boundedPosition(x + delta[0] * step, y + delta[1] * step, vector))) {
      selectedItemId.value = item.id;
      onMove();
    }
  }

  function isDragging(id: string) {
    return drag.value?.id === id && drag.value.moved;
  }

  function resizingEnd(id: string) {
    return resize.value?.id === id ? resize.value.end : undefined;
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
    startResize,
    updateResize,
    finishResize,
    resizeWithKey,
    cancelDrag,
    resetDrag,
    itemPosition,
    isDragging,
    resizingEnd,
    isRemoteDragging,
    moveWithKey,
  };
}

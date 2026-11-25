import { expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import { BOARD_WIDTH, LINE_INSET, type BoardItem, type BoardLine } from "../../shared/board";
import { useBoardItemInteractions } from "./board-item-interactions";
import { useBoardPresence } from "./board-presence";

const note = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "note",
  text: "An idea",
  color: "yellow",
  x: 20,
  y: 20,
} satisfies BoardItem;
const line = {
  id: "00000000-0000-4000-8000-000000000002",
  kind: "line",
  arrow: true,
  x: 40,
  y: 40,
  dx: 80,
  dy: 0,
} satisfies BoardLine;

function setupInteractions(items: BoardItem[] = [note]) {
  const viewport = ref({
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    scrollLeft: 0,
    scrollTop: 0,
    clientLeft: 0,
    clientTop: 0,
  } as HTMLDivElement);
  const sendMessage = vi.fn(() => true);
  const moveItem = vi.fn(() => true);
  const resizeItem = vi.fn(() => true);
  const editItem = vi.fn();
  const presence = useBoardPresence(sendMessage, () => "Guest");
  vi.spyOn(presence, "setDrag").mockImplementation(() => {});
  const actions = useBoardItemInteractions(
    viewport,
    {
      items: ref(items),
      status: ref("ready"),
      pendingPosition: () => undefined,
      presence,
      moveItem,
      resizeItem,
      sendMessage,
    },
    { editItem, onMove: vi.fn() },
  );
  return { ...actions, editItem, moveItem, resizeItem, sendMessage };
}

function pointer(
  type: string,
  pointerType: "mouse" | "touch",
  clientX: number,
  timeStamp: number,
  buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0,
) {
  return {
    type,
    pointerType,
    clientX,
    clientY: 40,
    timeStamp,
    isPrimary: true,
    button: 0,
    buttons,
    pointerId: 1,
    currentTarget: { setPointerCapture: vi.fn() },
  } as unknown as PointerEvent;
}

it("selects on a single touch tap and edits on a nearby second tap", () => {
  const interaction = setupInteractions();
  interaction.startDrag(pointer("pointerdown", "touch", 40, 100), note);
  interaction.finishDrag(pointer("pointerup", "touch", 40, 120), note);
  expect(interaction.selectedItemId.value).toBe(note.id);
  expect(interaction.editItem).not.toHaveBeenCalled();

  interaction.startDrag(pointer("pointerdown", "touch", 42, 200), note);
  const secondTap = pointer("pointerup", "touch", 42, 220);
  interaction.finishDrag(secondTap, note);
  expect(interaction.editItem).toHaveBeenCalledExactlyOnceWith(secondTap, note);
  expect(interaction.moveItem).not.toHaveBeenCalled();
});

it("moves an item when dragged and ignores the click generated after releasing it", () => {
  const interaction = setupInteractions();
  interaction.startDrag(pointer("pointerdown", "mouse", 40, 100), note);
  interaction.updateDrag(pointer("pointermove", "mouse", 70, 120));
  expect(interaction.isDragging(note.id)).toBe(true);
  expect(interaction.itemPosition(note)).toMatchObject({ x: 50, y: 20 });

  interaction.finishDrag(pointer("pointerup", "mouse", 70, 140), note);
  interaction.finishDrag(pointer("lostpointercapture", "mouse", 70, 140), note);
  interaction.selectItem({ detail: 1 } as MouseEvent, note);
  interaction.editOnDoubleClick({ detail: 2 } as MouseEvent, note);
  expect(interaction.isDragging(note.id)).toBe(false);
  expect(interaction.moveItem).toHaveBeenCalledExactlyOnceWith(
    note.id,
    expect.objectContaining({ x: 50, y: 20 }),
  );
  expect(interaction.editItem).not.toHaveBeenCalled();
});

it("saves the last preview when mouse capture is lost after release without a pointerup", () => {
  const interaction = setupInteractions();
  interaction.startDrag(pointer("pointerdown", "mouse", 40, 100), note);
  interaction.updateDrag(pointer("pointermove", "mouse", 70, 120));

  interaction.finishDrag(pointer("lostpointercapture", "mouse", 40, 140), note);
  interaction.finishDrag(pointer("pointerup", "mouse", 40, 141), note);

  expect(interaction.moveItem).toHaveBeenCalledExactlyOnceWith(
    note.id,
    expect.objectContaining({ x: 50, y: 20 }),
  );
  expect(interaction.sendMessage).not.toHaveBeenCalled();
});

it.each([
  ["lostpointercapture", "mouse", 1],
  ["lostpointercapture", "touch", 0],
  ["pointercancel", "mouse", 0],
] as const)("cancels on %s from %s with buttons=%i", (type, pointerType, buttons) => {
  const interaction = setupInteractions();
  interaction.startDrag(pointer("pointerdown", pointerType, 40, 100), note);
  interaction.updateDrag(pointer("pointermove", pointerType, 70, 120));

  interaction.finishDrag(pointer(type, pointerType, 70, 140, buttons), note);
  interaction.finishDrag(pointer("lostpointercapture", pointerType, 70, 141), note);

  expect(interaction.moveItem).not.toHaveBeenCalled();
  expect(interaction.sendMessage).toHaveBeenCalledExactlyOnceWith({
    type: "presence.drag-cancelled",
  });
});

it("drags a line’s start past its end while keeping the end anchored", () => {
  const interaction = setupInteractions([line]);
  interaction.startResize(pointer("pointerdown", "mouse", 40, 100), line, "start");
  expect(interaction.resizingEnd(line.id)).toBe("start");
  interaction.updateResize({ ...pointer("pointermove", "mouse", 160, 120), clientY: 90 });

  const geometry = { x: 160, y: 90, dx: -40, dy: -50 };
  expect(interaction.itemPosition(line)).toEqual(geometry);
  interaction.finishResize({ ...pointer("pointerup", "mouse", 160, 140), clientY: 90 });
  expect(interaction.resizingEnd(line.id)).toBeUndefined();

  expect(interaction.resizeItem).toHaveBeenCalledExactlyOnceWith(line.id, geometry, {
    x: 40,
    y: 40,
    dx: 80,
    dy: 0,
  });
});

it("limits a line’s translation to the position where both ends fit", () => {
  const interaction = setupInteractions([line]);
  interaction.startDrag(pointer("pointerdown", "mouse", 80, 100), line);
  interaction.finishDrag(pointer("pointerup", "mouse", BOARD_WIDTH, 140), line);

  expect(interaction.moveItem).toHaveBeenCalledExactlyOnceWith(
    line.id,
    expect.objectContaining({ x: BOARD_WIDTH - LINE_INSET - line.dx, y: line.y }),
  );
});

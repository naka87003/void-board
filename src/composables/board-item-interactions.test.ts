import { expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import type { BoardItem } from "../../shared/board";
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

function setupInteractions() {
  const viewport = ref({
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    scrollLeft: 0,
    scrollTop: 0,
  } as HTMLDivElement);
  const sendMessage = vi.fn(() => true);
  const moveItem = vi.fn(() => true);
  const editItem = vi.fn();
  const presence = useBoardPresence(sendMessage, () => "Guest");
  vi.spyOn(presence, "setDrag").mockImplementation(() => {});
  const actions = useBoardItemInteractions(
    viewport,
    {
      items: ref([note]),
      status: ref("ready"),
      pendingPosition: () => undefined,
      presence,
      moveItem,
      sendMessage,
    },
    { editItem, onMove: vi.fn() },
  );
  return { ...actions, editItem, moveItem };
}

function pointer(type: string, pointerType: "mouse" | "touch", clientX: number, timeStamp: number) {
  return {
    type,
    pointerType,
    clientX,
    clientY: 40,
    timeStamp,
    isPrimary: true,
    button: 0,
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
  interaction.selectItem({ detail: 1 } as MouseEvent, note);
  interaction.editOnDoubleClick({ detail: 2 } as MouseEvent, note);
  expect(interaction.isDragging(note.id)).toBe(false);
  expect(interaction.moveItem).toHaveBeenCalledExactlyOnceWith(
    note.id,
    expect.objectContaining({ x: 50, y: 20 }),
  );
  expect(interaction.editItem).not.toHaveBeenCalled();
});

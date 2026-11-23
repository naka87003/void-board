<script setup lang="ts">
import { BOARD_WIDTH, NOTE_HEIGHT, NOTE_WIDTH, type BoardItem } from "../../../shared/board";
import { noteColors } from "./note-colors";

defineProps<{
  item: BoardItem;
  position: Pick<BoardItem, "x" | "y">;
  disabled: boolean;
  selected: boolean;
  dragging: boolean;
  remoteDragging: boolean;
}>();

const emit = defineEmits<{
  dragStart: [event: PointerEvent];
  dragMove: [event: PointerEvent];
  dragEnd: [event: PointerEvent];
  moveWithKey: [event: KeyboardEvent];
  select: [event: MouseEvent];
  doubleClick: [event: MouseEvent];
}>();
</script>

<template>
  <article
    class="board-item"
    :class="{
      note: item.kind === 'note',
      'text-item': item.kind === 'text',
      selected,
      dragging,
      'remote-dragging': remoteDragging,
    }"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: item.kind === 'text' ? 'max-content' : `${NOTE_WIDTH}px`,
      maxWidth: item.kind === 'text' ? `${BOARD_WIDTH - position.x}px` : undefined,
      height: item.kind === 'text' ? undefined : `${NOTE_HEIGHT}px`,
      backgroundColor: item.kind === 'text' ? undefined : noteColors[item.color].background,
    }"
  >
    <button
      class="item-content"
      type="button"
      :disabled="disabled"
      :aria-pressed="selected"
      aria-keyshortcuts="Enter"
      @pointerdown="emit('dragStart', $event)"
      @pointermove="emit('dragMove', $event)"
      @pointerup="emit('dragEnd', $event)"
      @pointercancel="emit('dragEnd', $event)"
      @lostpointercapture="emit('dragEnd', $event)"
      @keydown="emit('moveWithKey', $event)"
      @click="emit('select', $event)"
      @dblclick="emit('doubleClick', $event)"
    >
      <span
        class="item-text"
        :style="
          item.kind === 'text'
            ? {
                fontSize: `${item.style.size}px`,
                fontWeight: item.style.bold ? 700 : 400,
                textDecorationLine: item.style.underline ? 'underline' : undefined,
              }
            : undefined
        "
      >
        {{ item.text }}
      </span>
    </button>
  </article>
</template>

<style scoped>
.board-item {
  position: absolute;
  display: flex;
  border-radius: 6px;
  overflow: hidden;
}
.note {
  color: #171717;
  box-shadow: 0 3px 8px #0002;
}
.text-item {
  align-items: flex-start;
  color: #f5f5f5;
  pointer-events: none;
}
.text-item button {
  pointer-events: auto;
}
.board-item.dragging,
.board-item.remote-dragging,
.board-item:focus-within,
.board-item.selected {
  z-index: 1;
}
.note:is(.dragging, .remote-dragging, :focus-within) {
  box-shadow: 0 8px 20px #0004;
}
.board-item.dragging {
  z-index: 2;
}
.item-content {
  color: inherit;
  border: 0;
  border-radius: inherit;
  background: none;
  display: flex;
  flex: 1;
  align-items: flex-start;
  min-height: 0;
  overflow: clip;
  text-align: start;
  padding: 10px 15px;
  touch-action: none;
  user-select: none;
}
.item-content:not(:disabled) {
  cursor: grab;
}
.dragging .item-content:not(:disabled) {
  cursor: grabbing;
}
.selected .item-content {
  box-shadow: inset 0 0 0 2px #38bdf8;
}
.text-item .item-content {
  flex: 0 1 auto;
  min-width: 0;
  padding: 4px 6px;
}
.item-text {
  overflow: hidden;
}
.note .item-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  line-clamp: 6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: 1.5;
}
.text-item .item-text {
  max-height: 5lh;
  text-overflow: ellipsis;
  white-space: pre;
  line-height: 1.3;
  text-underline-offset: 0.15em;
}
.board-item button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -3px;
}
</style>

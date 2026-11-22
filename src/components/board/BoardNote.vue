<script setup lang="ts">
import { NOTE_HEIGHT, NOTE_WIDTH, type Note } from "../../../shared/board";
import { noteColors } from "./note-colors";

defineProps<{
  note: Note;
  position: Pick<Note, "x" | "y">;
  disabled: boolean;
  dragging: boolean;
  remoteDragging: boolean;
}>();

const emit = defineEmits<{
  dragStart: [event: PointerEvent];
  dragMove: [event: PointerEvent];
  dragEnd: [event: PointerEvent];
  moveWithKey: [event: KeyboardEvent];
  edit: [event: MouseEvent];
}>();
</script>

<template>
  <article
    class="note"
    :class="{ dragging, 'remote-dragging': remoteDragging }"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${NOTE_WIDTH}px`,
      height: `${NOTE_HEIGHT}px`,
      backgroundColor: noteColors[note.color].background,
    }"
  >
    <button
      class="note-handle"
      type="button"
      :disabled="disabled"
      aria-label="Move note"
      title="Drag or use the arrow keys to move"
      @pointerdown="emit('dragStart', $event)"
      @pointermove="emit('dragMove', $event)"
      @pointerup="emit('dragEnd', $event)"
      @pointercancel="emit('dragEnd', $event)"
      @lostpointercapture="emit('dragEnd', $event)"
      @keydown="emit('moveWithKey', $event)"
    >
      <span aria-hidden="true"></span>
    </button>
    <button
      class="note-content"
      type="button"
      :disabled="disabled"
      title="Edit note"
      @click="emit('edit', $event)"
    >
      {{ note.text }}
    </button>
  </article>
</template>

<style scoped>
.note {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  color: #171717;
  box-shadow: 0 3px 8px #0002;
}
.note.dragging,
.note.remote-dragging,
.note:focus-within {
  z-index: 1;
  box-shadow: 0 8px 20px #0004;
}
.note.dragging {
  z-index: 2;
}
.note-handle,
.note-content {
  color: inherit;
  border: 0;
  background: none;
}
.note-handle {
  flex: 0 0 30px;
  cursor: grab;
  touch-action: none;
  display: grid;
  place-items: center;
}
.note-handle:hover {
  background: #0001;
}
.dragging .note-handle {
  cursor: grabbing;
}
.note-handle span {
  width: 27px;
  height: 4px;
  border-block: 1px solid #0008;
}
.note-content {
  display: flex;
  flex: 1;
  align-items: flex-start;
  min-height: 0;
  overflow: auto;
  text-align: start;
  padding: 8px 15px 15px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: 1.55;
}
.note button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -3px;
}
</style>

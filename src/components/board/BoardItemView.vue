<script setup lang="ts">
import { computed } from "vue";
import {
  BOARD_WIDTH,
  DEFAULT_LINE_STYLE,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  type BoardItem,
  type ItemPosition,
} from "../../../shared/board";
import { noteColors } from "./note-colors";

const props = defineProps<{
  item: BoardItem;
  position: ItemPosition;
  disabled: boolean;
  selected: boolean;
  dragging: boolean;
  resizingEnd?: (typeof lineEnds)[number];
  remoteDragging: boolean;
}>();

const lineStyle = computed(() => {
  if (props.item.kind !== "line") return;
  const dx = props.position.dx ?? props.item.dx;
  const dy = props.position.dy ?? props.item.dy;
  return {
    "--line-length": `${Math.hypot(dx, dy)}px`,
    "--line-angle": `${Math.atan2(dy, dx)}rad`,
    "--line-width": `${(props.item.style ?? DEFAULT_LINE_STYLE).width}px`,
    "--line-dx": `${dx}px`,
    "--line-dy": `${dy}px`,
  };
});
const lineEnds = ["start", "end"] as const;

const emit = defineEmits<{
  dragStart: [event: PointerEvent];
  dragMove: [event: PointerEvent];
  dragEnd: [event: PointerEvent];
  moveWithKey: [event: KeyboardEvent];
  select: [event: MouseEvent];
  doubleClick: [event: MouseEvent];
  resizeStart: [event: PointerEvent, end: (typeof lineEnds)[number]];
  resizeMove: [event: PointerEvent];
  resizeEnd: [event: PointerEvent];
  resizeWithKey: [event: KeyboardEvent, end: (typeof lineEnds)[number]];
}>();
</script>

<template>
  <article
    class="board-item"
    :class="{
      note: item.kind === 'note',
      'text-item': item.kind === 'text',
      'line-item': item.kind === 'line',
      'arrow-item': item.kind === 'line' && item.arrow,
      'dashed-line': item.kind === 'line' && item.style?.pattern === 'dashed',
      selected,
      dragging,
      resizing: resizingEnd !== undefined,
      'remote-dragging': remoteDragging,
    }"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
      width:
        item.kind === 'text' ? 'max-content' : item.kind === 'note' ? `${NOTE_WIDTH}px` : undefined,
      maxWidth: item.kind === 'text' ? `${BOARD_WIDTH - position.x}px` : undefined,
      height: item.kind === 'note' ? `${NOTE_HEIGHT}px` : undefined,
      backgroundColor: item.kind === 'note' ? noteColors[item.color].background : undefined,
      ...lineStyle,
    }"
  >
    <button
      class="item-content"
      type="button"
      :disabled="disabled"
      :aria-pressed="selected"
      :aria-label="item.kind === 'line' ? (item.arrow ? 'Arrow' : 'Line') : undefined"
      :aria-keyshortcuts="
        item.kind === 'line' ? 'Enter ArrowUp ArrowDown ArrowLeft ArrowRight' : 'Enter'
      "
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
        v-if="item.kind !== 'line'"
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
    <template v-if="item.kind === 'line'">
      <button
        v-for="end in lineEnds"
        :key="end"
        type="button"
        class="line-handle"
        :class="{ 'line-end': end === 'end', 'active-handle': resizingEnd === end }"
        :aria-label="end === 'start' ? 'Resize from start' : 'Resize from end'"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        :disabled="disabled"
        @pointerdown="emit('resizeStart', $event, end)"
        @pointermove="emit('resizeMove', $event)"
        @pointerup="emit('resizeEnd', $event)"
        @pointercancel="emit('resizeEnd', $event)"
        @lostpointercapture="emit('resizeEnd', $event)"
        @keydown="emit('resizeWithKey', $event, end)"
      />
    </template>
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
.board-item:is(.dragging, .resizing) {
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
.line-item {
  --line-selection-color: #38bdf8;
  --line-target-color: #bae6fd;
  overflow: visible;
  pointer-events: none;
  color: #f5f5f5;
}
.line-item .item-content {
  --line-stroke-width: var(--line-width);
  position: absolute;
  top: 0;
  left: 0;
  width: var(--line-length);
  height: 24px;
  padding: 0;
  overflow: visible;
  pointer-events: auto;
  transform-origin: left center;
  transform: translateY(-50%) rotate(var(--line-angle));
}
.line-item .item-content::before,
.arrow-item .item-content::after {
  content: "";
  position: absolute;
  top: 50%;
}
.line-item .item-content::before {
  inset-inline: 0;
  height: var(--line-stroke-width);
  background: currentColor;
  transform: translateY(-50%);
}
.dashed-line .item-content::before {
  background: repeating-linear-gradient(to left, currentColor 0 8px, transparent 8px 13px);
}
.arrow-item .item-content::after {
  right: 2px;
  width: 10px;
  height: 10px;
  border-top: var(--line-stroke-width) solid;
  border-right: var(--line-stroke-width) solid;
  transform: translateY(-50%) rotate(45deg);
}
.line-item.selected .item-content {
  color: var(--line-selection-color);
  box-shadow: none;
}
.line-item .item-content:focus-visible,
.line-item.dragging .item-content {
  --line-stroke-width: calc(var(--line-width) + 1px);
  color: var(--line-target-color);
}
.line-handle {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  visibility: hidden;
  border-radius: 50%;
  color: var(--line-selection-color);
  transform: translate(-50%, -50%);
  touch-action: none;
  cursor: crosshair;
}
.line-handle::before {
  content: "";
  display: block;
  width: 8px;
  height: 8px;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: var(--ui-color-neutral-950);
}
.line-end {
  left: var(--line-dx);
  top: var(--line-dy);
}
.line-item:is(.selected, .resizing, :focus-within) .line-handle:not(:disabled) {
  visibility: visible;
  pointer-events: auto;
}
.line-handle:is(:focus-visible, .active-handle) {
  color: var(--line-target-color);
}
.line-handle:is(:focus-visible, .active-handle)::before {
  background: currentColor;
}
.line-handle.active-handle::before {
  transform: scale(1.5);
}
@media (hover: hover) {
  .line-item:not(.resizing) .item-content:hover:not(:disabled) {
    --line-stroke-width: calc(var(--line-width) + 1px);
    color: var(--line-target-color);
  }
  .line-item:not(.dragging, .resizing) .line-handle:hover:not(:disabled) {
    color: var(--line-target-color);
  }
  .line-item:not(.dragging, .resizing) .line-handle:hover:not(:disabled)::before {
    background: currentColor;
    transform: scale(1.5);
  }
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

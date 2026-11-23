<script setup lang="ts">
import { useTemplateRef } from "vue";
import { BOARD_HEIGHT, BOARD_WIDTH, type Cursor } from "../../../shared/board";
import { peerColor } from "@/composables/board-presence";

defineProps<{
  cursors: ReadonlyMap<string, { cursor: Cursor; name: string }>;
  showEmpty: boolean;
}>();

const emit = defineEmits<{
  pointerMove: [event: PointerEvent];
  pointerLeave: [event: PointerEvent];
  canvasClick: [];
  scroll: [];
}>();

const viewport = useTemplateRef<HTMLDivElement>("viewport");
const canvasStyle = { width: `${BOARD_WIDTH}px`, height: `${BOARD_HEIGHT}px` };
defineExpose({ viewport });
</script>

<template>
  <div class="relative min-h-0 flex-1">
    <div
      ref="viewport"
      class="viewport"
      tabindex="0"
      aria-label="Board canvas"
      @pointermove="emit('pointerMove', $event)"
      @pointerleave="emit('pointerLeave', $event)"
      @scroll.passive="emit('scroll')"
    >
      <div class="canvas" :style="canvasStyle" @click.self="emit('canvasClick')">
        <slot />
        <div
          v-for="[peer, { cursor, name }] in cursors"
          :key="peer"
          class="peer-cursor"
          aria-hidden="true"
          :style="{ left: `${cursor.x}px`, top: `${cursor.y}px`, '--peer-color': peerColor(peer) }"
        >
          <span>{{ name }}</span>
        </div>
      </div>
    </div>
    <div
      v-if="showEmpty"
      class="pointer-events-none absolute inset-0 grid place-content-center px-4 text-center text-sm text-muted"
    >
      <p>Add a sticky note or text to get started</p>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  height: 100%;
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: 0.625rem;
  position: relative;
  background: var(--ui-color-neutral-950);
}
.canvas {
  position: relative;
  isolation: isolate;
  overflow: clip;
  background-image: radial-gradient(rgb(255 255 255 / 10%) 1px, transparent 1px);
  background-size: 20px 20px;
}
.peer-cursor {
  position: absolute;
  z-index: 3;
  pointer-events: none;
}
.peer-cursor::before {
  content: "";
  display: block;
  width: 17px;
  height: 19px;
  background: var(--peer-color);
  clip-path: polygon(0 0, 100% 64%, 55% 69%, 35% 100%);
}
.peer-cursor span {
  display: block;
  width: max-content;
  max-width: 240px;
  margin: -4px 0 0 13px;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: 5px;
  background: var(--peer-color);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

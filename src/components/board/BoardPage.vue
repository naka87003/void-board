<script setup lang="ts">
import UAlert from "@nuxt/ui/components/Alert.vue";
import UBadge from "@nuxt/ui/components/Badge.vue";
import UButton from "@nuxt/ui/components/Button.vue";
import { useEventListener, useSessionStorage, useTimeoutFn } from "@vueuse/core";
import { computed, ref, useTemplateRef, watch } from "vue";
import { routeUrl } from "void/routes";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  MAX_NAME,
  MAX_NOTES,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  type ClientMessage,
  type Note,
} from "../../../shared/board";
import AppShell from "@/components/AppShell.vue";
import BoardCanvas from "./BoardCanvas.vue";
import BoardNameDialog from "./BoardNameDialog.vue";
import BoardNote from "./BoardNote.vue";
import BoardNoteDialog from "./BoardNoteDialog.vue";
import BoardShareDialog from "./BoardShareDialog.vue";
import { useBoardConnection } from "@/composables/board-connection";

const { boardId } = defineProps<{ boardId: string }>();
const canvas = useTemplateRef("canvas");
const viewport = computed(() => canvas.value?.viewport);
const editorOpen = ref(false);
const storedName = useSessionStorage("void-board.displayName", "", {
  writeDefaults: false,
  flush: "sync",
});
const legacyName = sessionStorage.getItem("yohaku.displayName")?.trim().slice(0, MAX_NAME) ?? "";
const displayName = computed(() => storedName.value.trim().slice(0, MAX_NAME) || legacyName);
const choosingInitialName = ref(!displayName.value);
const nameDialogOpen = ref(choosingInitialName.value);
const nameDraft = ref("");
const draft = ref<Note>();
const editing = ref(false);
const pendingSave = ref<string>();
const saveError = ref("");
const saveTimeout = useTimeoutFn(interruptSave, 10_000, { immediate: false });
const feedback = ref<{ kind: "sync-error" } | { kind: "error"; message: string }>();
const drag = ref<{
  id: string;
  pointer: number;
  offsetX: number;
  offsetY: number;
  start: Pick<Note, "x" | "y">;
  x: number;
  y: number;
}>();
let dialogOpener: HTMLElement | undefined;
let pointerPosition: { clientX: number; clientY: number } | undefined;

const { status, notes, pendingPosition, presence, connectBoard, sendMessage, moveNote } =
  useBoardConnection(boardId, () => displayName.value, {
    onSnapshot() {
      if (feedback.value?.kind === "sync-error") feedback.value = undefined;
      updateCursorPosition();
    },
    onDisconnect() {
      drag.value = undefined;
      interruptSave();
    },
    onSyncError() {
      feedback.value = { kind: "sync-error" };
    },
    onSave(requestId, note) {
      if (requestId !== pendingSave.value) return;
      finishSave();
      if (note.text !== draft.value?.text.trim() || note.color !== draft.value.color) {
        editing.value = true;
        saveError.value =
          "This note already exists with different content. Review your draft and save again.";
        return;
      }
      editorOpen.value = false;
    },
    onError(reason, requestId) {
      const message = {
        full: "This board has reached its note limit.",
        missing: "This note has already been deleted.",
        storage: "Couldn’t save your changes. Please try again.",
      }[reason];
      if (!requestId) {
        feedback.value = { kind: "error", message };
      } else if (requestId === pendingSave.value) {
        finishSave();
        saveError.value = message;
      }
    },
  });
const { cursors, notePreviews } = presence;

watch(notes, (currentNotes) => {
  const active = drag.value;
  if (active && !currentNotes.some((note) => note.id === active.id)) cancelDrag();
});

const statusLabel = computed(
  () =>
    ({
      connecting: "Connecting",
      ready: "Live",
      disconnected: "Reconnecting",
    })[status.value],
);

const boardUrl = new URL(
  routeUrl("/boards/[board]", { params: { board: boardId } }),
  location.origin,
).href;

useEventListener(window, "blur", clearPointer);

function restoreDialogFocus(event: Event) {
  event.preventDefault();
  (dialogOpener?.isConnected ? dialogOpener : viewport.value)?.focus();
  dialogOpener = undefined;
}

function send(message: ClientMessage) {
  if (!sendMessage(message)) return false;
  feedback.value = undefined;
  return true;
}

function editName(event: MouseEvent) {
  dialogOpener = event.currentTarget as HTMLElement;
  choosingInitialName.value = false;
  nameDraft.value = displayName.value;
  nameDialogOpen.value = true;
}

function saveName(draftName: string) {
  const name = draftName.trim();
  if (name.length > MAX_NAME || (!name && !choosingInitialName.value)) return;
  storedName.value = name || "Guest";
  connectBoard();
  presence.updateName();
  nameDialogOpen.value = false;
}

function movePointer(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  pointerPosition = { clientX: event.clientX, clientY: event.clientY };
  updateCursorPosition();
}

function updateCursorPosition() {
  const element = viewport.value;
  if (!pointerPosition || !element || status.value !== "ready") return;
  const bounds = element.getBoundingClientRect();
  const x = pointerPosition.clientX - bounds.left - element.clientLeft;
  const y = pointerPosition.clientY - bounds.top - element.clientTop;
  const position = {
    x: Math.round(x + element.scrollLeft),
    y: Math.round(y + element.scrollTop),
  };
  const inside =
    x >= 0 &&
    y >= 0 &&
    x < element.clientWidth &&
    y < element.clientHeight &&
    position.x <= BOARD_WIDTH &&
    position.y <= BOARD_HEIGHT;
  presence.setCursor(inside ? position : null);
}

function clearPointer(event: Event) {
  if (event instanceof PointerEvent && event.pointerType === "touch") return;
  if (event.type === "blur") cancelDrag();
  pointerPosition = undefined;
  presence.setCursor(null);
}

function cancelDrag() {
  if (!drag.value) return;
  drag.value = undefined;
  presence.endDrag();
  sendMessage({ type: "presence.drag-cancelled" });
}

function boundedPosition(x: number, y: number) {
  return {
    x: Math.round(Math.min(BOARD_WIDTH - NOTE_WIDTH, Math.max(0, x))),
    y: Math.round(Math.min(BOARD_HEIGHT - NOTE_HEIGHT, Math.max(0, y))),
  };
}

function openEditor(event: MouseEvent, note?: Note) {
  if (status.value !== "ready") return;

  if (note) {
    draft.value = { ...note };
  } else {
    if (notes.value.length >= MAX_NOTES) {
      feedback.value = { kind: "error", message: "This board has reached its note limit." };
      return;
    }

    const left = viewport.value?.scrollLeft ?? 0;
    const top = viewport.value?.scrollTop ?? 0;
    const offset =
      Array.from({ length: 12 }, (_, i) => i * 26).find((step) => {
        const position = boundedPosition(left + 28 + step, top + 32 + step);
        return !notes.value.some(
          (item) => Math.abs(item.x - position.x) < 24 && Math.abs(item.y - position.y) < 24,
        );
      }) ?? 0;

    draft.value = {
      id: crypto.randomUUID(),
      color: "yellow",
      text: "",
      ...boundedPosition(left + 28 + offset, top + 32 + offset),
    };
  }

  dialogOpener = event.currentTarget as HTMLElement;
  editing.value = Boolean(note);
  saveError.value = "";
  editorOpen.value = true;
}

function saveNote() {
  if (pendingSave.value || !draft.value || !draft.value.text.trim()) return;
  const note = { ...draft.value, text: draft.value.text.trim() };
  const requestId = crypto.randomUUID();
  // A previous save may have reached the server before its connection closed.
  const alreadyExists = editing.value || notes.value.some((item) => item.id === note.id);
  const message: ClientMessage = alreadyExists
    ? { type: "note.edit", id: note.id, text: note.text, color: note.color, requestId }
    : { type: "note.add", note, requestId };

  if (!send(message)) return;
  saveError.value = "";
  pendingSave.value = requestId;
  saveTimeout.start();
}

function finishSave() {
  saveTimeout.stop();
  pendingSave.value = undefined;
}

function interruptSave() {
  if (!pendingSave.value) return;
  finishSave();
  saveError.value = "Couldn’t confirm the save. Your draft is still here.";
}

function removeNote() {
  if (draft.value && send({ type: "note.remove", id: draft.value.id })) editorOpen.value = false;
}

function startDrag(event: PointerEvent, note: Note) {
  if (event.button !== 0 || status.value !== "ready" || drag.value || !viewport.value) return;
  const bounds = viewport.value.getBoundingClientRect();
  const { x, y } = notePosition(note);
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  drag.value = {
    id: note.id,
    pointer: event.pointerId,
    offsetX: event.clientX - bounds.left + viewport.value.scrollLeft - x,
    offsetY: event.clientY - bounds.top + viewport.value.scrollTop - y,
    start: { x, y },
    x,
    y,
  };
}

function updateDrag(event: PointerEvent) {
  if (!drag.value || drag.value.pointer !== event.pointerId || !viewport.value) return;
  const bounds = viewport.value.getBoundingClientRect();
  Object.assign(
    drag.value,
    boundedPosition(
      event.clientX - bounds.left + viewport.value.scrollLeft - drag.value.offsetX,
      event.clientY - bounds.top + viewport.value.scrollTop - drag.value.offsetY,
    ),
  );
  const { id, x, y } = drag.value;
  presence.setDrag({ id, x, y });
}

function finishDrag(event: PointerEvent) {
  const active = drag.value;
  if (!active || active.pointer !== event.pointerId) return;

  if (event.type === "pointerup") {
    updateDrag(event);
  }

  presence.endDrag();
  const previous = pendingPosition(active.id) ?? notes.value.find((note) => note.id === active.id);
  if (
    event.type === "pointerup" &&
    previous &&
    (active.start.x !== active.x || active.start.y !== active.y) &&
    (previous.x !== active.x || previous.y !== active.y) &&
    moveNote(active.id, active)
  ) {
    feedback.value = undefined;
  } else {
    sendMessage({ type: "presence.drag-cancelled" });
  }
  drag.value = undefined;
}

function notePosition(note: Note) {
  if (drag.value?.id === note.id) return drag.value;
  return pendingPosition(note.id) ?? notePreviews.value.get(note.id) ?? note;
}

function moveWithKey(event: KeyboardEvent, note: Note) {
  const direction: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const delta = direction[event.key];
  if (!delta) return;

  event.preventDefault();
  const step = event.shiftKey ? 48 : 12;
  const { x, y } = pendingPosition(note.id) ?? note;
  if (moveNote(note.id, boundedPosition(x + delta[0] * step, y + delta[1] * step))) {
    feedback.value = undefined;
  }
}
</script>

<template>
  <AppShell>
    <template #header-actions>
      <div class="flex items-center gap-2 sm:gap-4">
        <UBadge
          :color="status === 'ready' ? 'success' : 'neutral'"
          :variant="status === 'ready' ? 'soft' : 'outline'"
          role="status"
        >
          {{ statusLabel }}
        </UBadge>
        <BoardShareDialog :url="boardUrl" />
      </div>
    </template>

    <main
      class="mx-auto flex h-[calc(100dvh-4rem)] min-h-96 w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold tracking-tight text-highlighted sm:text-2xl">
            Sticky note board
          </h1>
          <p class="text-sm text-muted">
            {{ notes.length }} {{ notes.length === 1 ? "note" : "notes" }}
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          label="Add note"
          :disabled="status !== 'ready'"
          @click="openEditor"
        />
      </div>

      <BoardCanvas
        ref="canvas"
        :cursors="cursors"
        :show-empty="status === 'ready' && notes.length === 0"
        @pointer-move="movePointer"
        @pointer-leave="clearPointer"
        @scroll="updateCursorPosition"
      >
        <BoardNote
          v-for="note in notes"
          :key="note.id"
          :note="note"
          :position="notePosition(note)"
          :disabled="status !== 'ready'"
          :dragging="drag?.id === note.id"
          :remote-dragging="
            drag?.id !== note.id && !pendingPosition(note.id) && notePreviews.has(note.id)
          "
          @drag-start="startDrag($event, note)"
          @drag-move="updateDrag"
          @drag-end="finishDrag"
          @move-with-key="moveWithKey($event, note)"
          @edit="openEditor($event, note)"
        />
      </BoardCanvas>
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted">Select a note to edit it, or drag its handle to move it.</p>
        <UButton
          v-if="displayName"
          color="neutral"
          variant="link"
          class="max-w-[40%]"
          :label="displayName"
          :aria-label="'Change display name. Current name: ' + displayName"
          @click="editName"
        />
      </div>
    </main>

    <div
      v-if="feedback"
      class="pointer-events-none fixed inset-x-4 bottom-4 z-10 flex justify-center"
    >
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="
          feedback.kind === 'sync-error' ? 'Couldn’t refresh the board.' : feedback.message
        "
        close
        role="alert"
        class="pointer-events-auto w-fit max-w-full items-center shadow-sm"
        @update:open="feedback = undefined"
      />
    </div>

    <BoardNoteDialog
      v-model:open="editorOpen"
      v-model:draft="draft"
      :connected="status === 'ready'"
      :editing="editing"
      :saving="!!pendingSave"
      :save-error="saveError"
      @save="saveNote"
      @remove="removeNote"
      @close-auto-focus="restoreDialogFocus"
    />

    <BoardNameDialog
      v-model:open="nameDialogOpen"
      v-model:draft="nameDraft"
      :initial="choosingInitialName"
      @save="saveName"
      @close-auto-focus="restoreDialogFocus"
    />
  </AppShell>
</template>

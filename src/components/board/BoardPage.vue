<script setup lang="ts">
import UAlert from "@nuxt/ui/components/Alert.vue";
import UBadge from "@nuxt/ui/components/Badge.vue";
import UButton from "@nuxt/ui/components/Button.vue";
import { useEventListener, useSessionStorage, useTimeoutFn } from "@vueuse/core";
import { computed, ref, shallowRef, useTemplateRef } from "vue";
import { routeUrl } from "void/routes";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_TEXT_STYLE,
  MAX_NAME,
  MAX_ITEMS,
  sameItemContent,
  type ClientMessage,
  type BoardItem,
  type ItemContent,
} from "../../../shared/board";
import AppShell from "@/components/AppShell.vue";
import BoardCanvas from "./BoardCanvas.vue";
import BoardItemDialog from "./BoardItemDialog.vue";
import BoardItemView from "./BoardItemView.vue";
import BoardNameDialog from "./BoardNameDialog.vue";
import BoardShareDialog from "./BoardShareDialog.vue";
import BoardTitleDialog from "./BoardTitleDialog.vue";
import { useBoardConnection } from "@/composables/board-connection";
import { boundedPosition, useBoardItemInteractions } from "@/composables/board-item-interactions";

const { boardId } = defineProps<{ boardId: string }>();
type ItemChange = Extract<ClientMessage, { type: "item.add" | "item.edit" | "item.remove" }> & {
  requestId: string;
};
const canvas = useTemplateRef("canvas");
const viewport = computed(() => canvas.value?.viewport);
const editorOpen = ref(false);
const storedName = useSessionStorage("void-board.displayName", "", {
  writeDefaults: false,
  flush: "sync",
});
const displayName = computed(() => storedName.value.trim().slice(0, MAX_NAME));
const choosingInitialName = ref(!displayName.value);
const nameDialogOpen = ref(choosingInitialName.value);
const nameDraft = ref("");
const draft = ref<BoardItem>();
const originalContent = shallowRef<ItemContent>();
const editConflict = ref(false);
const editing = computed(() => Boolean(originalContent.value) || editConflict.value);
const pendingChange = shallowRef<{ kind: "save" | "delete"; requestId: string }>();
const itemError = ref("");
const changeTimeout = useTimeoutFn(interruptItemChange, 10_000, { immediate: false });
const feedback = ref<{ kind: "sync-error" } | { kind: "error"; message: string }>();
let dialogOpener: HTMLElement | undefined;
let pointerPosition: { clientX: number; clientY: number } | undefined;

const connection = useBoardConnection(boardId, () => displayName.value, {
  onSnapshot() {
    if (feedback.value?.kind === "sync-error") feedback.value = undefined;
    updateCursorPosition();
  },
  onDisconnect() {
    resetDrag();
    interruptItemChange();
  },
  onSyncError() {
    feedback.value = { kind: "sync-error" };
  },
  onSave(requestId, item) {
    if (pendingChange.value?.kind !== "save" || requestId !== pendingChange.value.requestId) return;
    finishItemChange();
    const current = draft.value;
    if (current && !sameItemContent(item, { ...current, text: current.text.trim() })) {
      editConflict.value = true;
      return;
    }
    editorOpen.value = false;
  },
  onRemove(requestId) {
    if (pendingChange.value?.kind !== "delete" || requestId !== pendingChange.value.requestId)
      return;
    finishItemChange();
    editorOpen.value = false;
  },
  onError(reason, requestId) {
    const pending = pendingChange.value;
    if (reason === "conflict") {
      if (pending?.kind === "save" && requestId === pending.requestId) {
        finishItemChange();
        editConflict.value = true;
      }
      return;
    }
    const message = {
      full: "This board has reached its item limit.",
      missing: "This item has already been deleted.",
      kind: "This item’s type does not match your draft.",
      storage: "Couldn’t save your changes. Please try again.",
    }[reason];
    if (!requestId) {
      feedback.value = { kind: "error", message };
    } else if (requestId === pending?.requestId) {
      finishItemChange();
      itemError.value =
        pending.kind === "delete" && reason === "storage"
          ? "Couldn’t delete the item. Please try again."
          : message;
    }
  },
});
const { status, title, items, presence, connectBoard, sendMessage } = connection;
const { cursors } = presence;
const {
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
} = useBoardItemInteractions(viewport, connection, {
  editItem: openEditor,
  onMove() {
    feedback.value = undefined;
  },
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

function openEditor(event: MouseEvent, target: BoardItem | BoardItem["kind"]) {
  if (status.value !== "ready") return;

  const item = typeof target === "object" ? target : undefined;
  if (item) {
    draft.value = { ...item };
  } else {
    if (items.value.length >= MAX_ITEMS) {
      feedback.value = { kind: "error", message: "This board has reached its item limit." };
      return;
    }

    const left = viewport.value?.scrollLeft ?? 0;
    const top = viewport.value?.scrollTop ?? 0;
    const offset =
      Array.from({ length: 12 }, (_, i) => i * 26).find((step) => {
        const position = boundedPosition(left + 28 + step, top + 32 + step);
        return !items.value.some(
          (item) => Math.abs(item.x - position.x) < 24 && Math.abs(item.y - position.y) < 24,
        );
      }) ?? 0;

    const initial = {
      id: crypto.randomUUID(),
      text: "",
      ...boundedPosition(left + 28 + offset, top + 32 + offset),
    };
    draft.value =
      target === "text"
        ? { ...initial, kind: "text", style: DEFAULT_TEXT_STYLE }
        : { ...initial, kind: "note", color: "yellow" };
  }

  dialogOpener = event.currentTarget as HTMLElement;
  originalContent.value = item && getItemContent(item);
  editConflict.value = false;
  itemError.value = "";
  editorOpen.value = true;
}

function getItemContent({ id, x, y, ...content }: BoardItem) {
  return content;
}

function saveItem(overwrite: boolean) {
  if (!draft.value?.text.trim() || overwrite !== editConflict.value) return;
  const item = { ...draft.value, text: draft.value.text.trim() };
  const requestId = crypto.randomUUID();
  const baseContent = overwrite ? null : originalContent.value;
  const message: ItemChange =
    baseContent === undefined
      ? { type: "item.add", item, requestId }
      : { type: "item.edit", id: item.id, content: getItemContent(item), baseContent, requestId };

  submitItemChange(message);
}

function submitItemChange(message: ItemChange) {
  if (pendingChange.value || !send(message)) return;
  itemError.value = "";
  pendingChange.value = {
    kind: message.type === "item.remove" ? "delete" : "save",
    requestId: message.requestId,
  };
  changeTimeout.start();
}

function finishItemChange() {
  changeTimeout.stop();
  pendingChange.value = undefined;
}

function interruptItemChange() {
  const pending = pendingChange.value;
  if (!pending) return;
  finishItemChange();
  itemError.value =
    pending.kind === "delete"
      ? "Couldn’t confirm the deletion. Please try again."
      : "Couldn’t confirm the save. Your draft is still here.";
}

function removeItem() {
  if (draft.value) {
    submitItemChange({ type: "item.remove", id: draft.value.id, requestId: crypto.randomUUID() });
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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 max-w-full">
          <h1>
            <BoardTitleDialog :board-id="boardId" :title="title" :disabled="status !== 'ready'" />
          </h1>
          <p class="text-sm text-muted">
            {{ items.length }} {{ items.length === 1 ? "item" : "items" }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-sticky-note"
            label="Add sticky note"
            color="neutral"
            variant="outline"
            :disabled="status !== 'ready'"
            @click="openEditor($event, 'note')"
          />
          <UButton
            icon="i-lucide-type"
            label="Add text"
            color="neutral"
            variant="outline"
            :disabled="status !== 'ready'"
            @click="openEditor($event, 'text')"
          />
        </div>
      </div>

      <BoardCanvas
        ref="canvas"
        :cursors="cursors"
        :show-empty="status === 'ready' && items.length === 0"
        @pointer-move="movePointer"
        @pointer-leave="clearPointer"
        @canvas-click="clearSelection"
        @scroll="updateCursorPosition"
      >
        <BoardItemView
          v-for="item in items"
          :key="item.id"
          :item="item"
          :position="itemPosition(item)"
          :disabled="status !== 'ready'"
          :selected="selectedItemId === item.id"
          :dragging="isDragging(item.id)"
          :remote-dragging="isRemoteDragging(item.id)"
          @drag-start="startDrag($event, item)"
          @drag-move="updateDrag"
          @drag-end="finishDrag($event, item)"
          @move-with-key="moveWithKey($event, item)"
          @select="selectItem($event, item)"
          @double-click="editOnDoubleClick($event, item)"
        />
      </BoardCanvas>
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Drag to move. Double-click, double-tap, or press Enter to edit.
        </p>
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

    <BoardItemDialog
      v-model:open="editorOpen"
      v-model:draft="draft"
      :connected="status === 'ready'"
      :editing="editing"
      :conflict="editConflict"
      :pending="pendingChange?.kind"
      :error="itemError"
      @save="saveItem(false)"
      @overwrite="saveItem(true)"
      @remove="removeItem"
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

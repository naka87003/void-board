<script setup lang="ts">
import { CircleAlert, Plus, X } from "@lucide/vue";
import { useEventListener, useSessionStorage, useTimeoutFn } from "@vueuse/core";
import { computed, ref } from "vue";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  MAX_NAME,
  MAX_NOTES,
  MAX_TEXT,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  colors,
  idPattern,
  type ClientMessage,
  type Note,
} from "../shared/board";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useBoardConnection } from "@/composables/board-connection";
import { peerColor } from "@/composables/board-presence";
import voidLogo from "./assets/void-logo.svg";

const colorLabels = {
  yellow: "Yellow",
  mint: "Mint",
  lilac: "Lilac",
  peach: "Peach",
};

const requestedBoard = new URLSearchParams(location.search).get("board");
const board = requestedBoard && idPattern.test(requestedBoard) ? requestedBoard : null;
const viewport = ref<HTMLElement>();
const editorOpen = ref(false);
const storedName = useSessionStorage("void-board.displayName", "", {
  writeDefaults: false,
  flush: "sync",
});
const legacyName = sessionStorage.getItem("yohaku.displayName")?.trim().slice(0, MAX_NAME) ?? "";
const displayName = computed(() => storedName.value.trim().slice(0, MAX_NAME) || legacyName);
const choosingInitialName = ref(!displayName.value);
const nameDialogOpen = ref(Boolean(board && choosingInitialName.value));
const nameDraft = ref("");
const shareDialogOpen = ref(false);
const shareLink = ref<InstanceType<typeof Input>>();
const shareStatus = ref("");
const draft = ref<Note>();
const editing = ref(false);
const pendingSave = ref<string>();
const saveError = ref("");
const saveTimeout = useTimeoutFn(interruptSave, 10_000, { immediate: false });
const feedback = ref("");
const drag = ref<{
  id: string;
  pointer: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
}>();
let dialogOpener: HTMLElement | undefined;
let pointerPosition: { clientX: number; clientY: number } | undefined;

const { status, notes, presence, connectBoard, sendMessage } = useBoardConnection(
  board,
  () => displayName.value,
  {
    onSnapshot: updateCursorPosition,
    onDisconnect() {
      drag.value = undefined;
      interruptSave();
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
        feedback.value = message;
      } else if (requestId === pendingSave.value) {
        finishSave();
        saveError.value = message;
      }
    },
  },
);
const { cursors, notePreviews } = presence;
const statusLabel = computed(
  () =>
    ({
      connecting: "Connecting",
      ready: "Live",
      disconnected: "Reconnecting",
    })[status.value],
);

const canvasStyle = { width: BOARD_WIDTH + "px", height: BOARD_HEIGHT + "px" };
const boardUrl = board ? new URL("?board=" + board, location.origin).href : "";

if (board) useEventListener(window, "blur", clearPointer);

function createBoard() {
  location.assign("?board=" + crypto.randomUUID());
}

function shareBoard(event: MouseEvent) {
  dialogOpener = event.currentTarget as HTMLElement;
  shareStatus.value = "";
  shareDialogOpen.value = true;
}

function restoreDialogFocus(event: Event) {
  event.preventDefault();
  (dialogOpener ?? viewport.value)?.focus();
  dialogOpener = undefined;
}

async function copyBoardLink() {
  try {
    await navigator.clipboard.writeText(boardUrl);
    shareStatus.value = "Board link copied.";
  } catch {
    const input = shareLink.value?.$el as HTMLInputElement | undefined;
    input?.focus();
    input?.select();
    shareStatus.value = "Copy the selected link to share this board.";
  }
}

function send(message: ClientMessage) {
  if (!sendMessage(message)) return false;
  feedback.value = "";
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
  if (event.type === "blur" && drag.value) {
    drag.value = undefined;
    presence.endDrag();
    sendMessage({ type: "presence.drag-cancelled" });
  }
  pointerPosition = undefined;
  presence.setCursor(null);
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
      feedback.value = "This board has reached its note limit.";
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
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  drag.value = {
    id: note.id,
    pointer: event.pointerId,
    offsetX: event.clientX - bounds.left + viewport.value.scrollLeft - note.x,
    offsetY: event.clientY - bounds.top + viewport.value.scrollTop - note.y,
    x: note.x,
    y: note.y,
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
  drag.value = undefined;
  const note = notes.value.find((item) => item.id === active.id);
  if (event.type === "pointerup" && note && (note.x !== active.x || note.y !== active.y)) {
    send({ type: "note.move", id: active.id, x: active.x, y: active.y });
  } else {
    sendMessage({ type: "presence.drag-cancelled" });
  }
}

function notePosition(note: Note) {
  return drag.value?.id === note.id ? drag.value : (notePreviews.value.get(note.id) ?? note);
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
  send({
    type: "note.move",
    id: note.id,
    ...boundedPosition(note.x + delta[0] * step, note.y + delta[1] * step),
  });
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b">
      <div
        class="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-2 px-4 sm:px-6"
      >
        <a
          class="inline-flex shrink-0 items-center rounded-sm"
          href="/"
          aria-label="Void Board home"
        >
          <img :src="voidLogo" class="h-4 w-auto" width="270" height="58" alt="" />
        </a>
        <div v-if="board" class="flex items-center gap-2 sm:gap-4">
          <Badge :variant="status === 'ready' ? 'secondary' : 'outline'" role="status">
            {{ statusLabel }}
          </Badge>
          <Button variant="outline" type="button" @click="shareBoard">Share link</Button>
        </div>
      </div>
    </header>

    <main
      v-if="board"
      class="mx-auto flex h-[calc(100dvh-4rem)] min-h-96 w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Sticky note board</h1>
          <p class="text-sm text-muted-foreground">
            {{ notes.length }} {{ notes.length === 1 ? "note" : "notes" }}
          </p>
        </div>
        <Button type="button" :disabled="status !== 'ready'" @click="openEditor($event)">
          <Plus aria-hidden="true" />
          Add note
        </Button>
      </div>

      <div class="relative min-h-0 flex-1">
        <div
          ref="viewport"
          class="viewport"
          tabindex="0"
          aria-label="Board canvas"
          @pointermove="movePointer"
          @pointerleave="clearPointer"
          @scroll.passive="updateCursorPosition"
        >
          <div class="canvas" :style="canvasStyle">
            <article
              v-for="note in notes"
              :key="note.id"
              class="note"
              :class="[
                note.color,
                {
                  dragging: drag?.id === note.id,
                  'remote-dragging': drag?.id !== note.id && notePreviews.has(note.id),
                },
              ]"
              :style="{
                left: notePosition(note).x + 'px',
                top: notePosition(note).y + 'px',
                width: NOTE_WIDTH + 'px',
                height: NOTE_HEIGHT + 'px',
              }"
            >
              <button
                class="note-handle"
                type="button"
                :disabled="status !== 'ready'"
                aria-label="Move note"
                title="Drag or use the arrow keys to move"
                @pointerdown="startDrag($event, note)"
                @pointermove="updateDrag"
                @pointerup="finishDrag"
                @pointercancel="finishDrag"
                @lostpointercapture="finishDrag"
                @keydown="moveWithKey($event, note)"
              >
                <span aria-hidden="true"></span>
              </button>
              <button
                class="note-content"
                type="button"
                :disabled="status !== 'ready'"
                title="Edit note"
                @click="openEditor($event, note)"
              >
                {{ note.text }}
              </button>
            </article>
            <div
              v-for="[peer, { cursor, name }] in cursors"
              :key="peer"
              class="peer-cursor"
              aria-hidden="true"
              :style="{
                left: cursor.x + 'px',
                top: cursor.y + 'px',
                '--peer-color': peerColor(peer),
              }"
            >
              <span>{{ name }}</span>
            </div>
          </div>
        </div>
        <div
          v-if="status === 'ready' && notes.length === 0"
          class="pointer-events-none absolute inset-0 grid place-content-center px-4 text-center text-sm text-muted-foreground"
        >
          <p>Add your first sticky note</p>
        </div>
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          Select a note to edit it, or drag its handle to move it.
        </p>
        <Button
          v-if="displayName"
          variant="link"
          size="sm"
          class="block max-w-[40%] truncate"
          type="button"
          :aria-label="'Change display name. Current name: ' + displayName"
          @click="editName"
        >
          {{ displayName }}
        </Button>
      </div>
    </main>

    <main v-else class="grid flex-1 place-items-center bg-muted/40 p-4 sm:p-6">
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1" class="text-2xl tracking-tight">A shared canvas for ideas.</CardTitle>
          <CardDescription>
            Capture ideas on sticky notes, then share a link to arrange them together in real time.
          </CardDescription>
        </CardHeader>
        <CardFooter class="flex-col items-stretch gap-4">
          <Alert v-if="requestedBoard !== null" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>This board link is invalid.</AlertDescription>
          </Alert>
          <Button type="button" @click="createBoard">
            <Plus aria-hidden="true" />
            Create a board
          </Button>
        </CardFooter>
      </Card>
    </main>

    <div
      v-if="feedback"
      class="pointer-events-none fixed inset-x-4 bottom-4 z-10 flex justify-center"
    >
      <Alert
        variant="destructive"
        class="pointer-events-auto w-fit max-w-full items-center shadow-sm"
      >
        <CircleAlert aria-hidden="true" />
        <AlertDescription class="flex items-center gap-3">
          {{ feedback }}
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="Dismiss notification"
            @click="feedback = ''"
          >
            <X aria-hidden="true" />
          </Button>
        </AlertDescription>
      </Alert>
    </div>

    <Dialog v-model:open="editorOpen">
      <DialogContent
        class="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        :aria-describedby="undefined"
        :show-close-button="!pendingSave"
        @escape-key-down="pendingSave && $event.preventDefault()"
        @pointer-down-outside.prevent
        @close-auto-focus="restoreDialogFocus"
      >
        <form v-if="draft" class="grid gap-5" @submit.prevent="saveNote">
          <DialogHeader>
            <DialogTitle>{{ editing ? "Edit note" : "New note" }}</DialogTitle>
          </DialogHeader>
          <div class="grid gap-2">
            <Label for="note-text">Text</Label>
            <Textarea
              id="note-text"
              v-model="draft.text"
              :maxlength="MAX_TEXT"
              :disabled="!!pendingSave"
              required
            />
          </div>
          <div class="grid gap-3">
            <p id="note-color-label" class="text-sm font-medium">Color</p>
            <RadioGroup
              v-model="draft.color"
              aria-labelledby="note-color-label"
              class="grid-cols-2"
              :disabled="!!pendingSave"
            >
              <div v-for="color in colors" :key="color" class="flex items-center gap-2">
                <RadioGroupItem :id="'note-color-' + color" :value="color" />
                <Label :for="'note-color-' + color">
                  <span class="size-3 rounded-full border" :class="color" aria-hidden="true"></span>
                  {{ colorLabels[color] }}
                </Label>
              </div>
            </RadioGroup>
          </div>
          <p v-if="status !== 'ready'" class="text-sm text-destructive" role="status">
            You can save once the board reconnects.
          </p>
          <p v-if="saveError" class="text-sm text-destructive" role="alert">{{ saveError }}</p>
          <DialogFooter>
            <Button
              v-if="editing"
              variant="destructive"
              type="button"
              class="sm:mr-auto"
              :disabled="status !== 'ready' || !!pendingSave"
              @click="removeNote"
            >
              Delete
            </Button>
            <DialogClose as-child>
              <Button variant="outline" type="button" :disabled="!!pendingSave">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              :disabled="status !== 'ready' || !!pendingSave || !draft.text.trim()"
            >
              {{ pendingSave ? "Saving…" : "Save" }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="nameDialogOpen">
      <DialogContent
        class="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        :show-close-button="!choosingInitialName"
        @escape-key-down="choosingInitialName && $event.preventDefault()"
        @pointer-down-outside.prevent
        @close-auto-focus="restoreDialogFocus"
      >
        <form class="grid gap-5" @submit.prevent="saveName(nameDraft)">
          <DialogHeader>
            <DialogTitle>{{
              choosingInitialName ? "Join board" : "Change display name"
            }}</DialogTitle>
            <DialogDescription>
              Others on this board will see this name next to your cursor.
              <template v-if="choosingInitialName"> You can also continue as Guest.</template>
            </DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <Label for="display-name">Display name</Label>
            <Input
              id="display-name"
              v-model="nameDraft"
              :maxlength="MAX_NAME"
              :required="!choosingInitialName"
            />
          </div>
          <DialogFooter>
            <Button
              v-if="choosingInitialName"
              variant="outline"
              type="button"
              @click="saveName('Guest')"
            >
              Continue as Guest
            </Button>
            <DialogClose v-else as-child>
              <Button variant="outline" type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" :disabled="!choosingInitialName && !nameDraft.trim()">
              {{ choosingInitialName ? "Join" : "Save" }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="shareDialogOpen">
      <DialogContent
        class="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        :aria-describedby="undefined"
        @pointer-down-outside.prevent
        @close-auto-focus="restoreDialogFocus"
      >
        <DialogHeader>
          <DialogTitle>Share board</DialogTitle>
        </DialogHeader>
        <div class="grid gap-2">
          <Label for="board-link">Board link</Label>
          <Input id="board-link" ref="shareLink" :model-value="boardUrl" readonly />
          <Button variant="link" as-child class="h-auto w-fit p-0">
            <a :href="boardUrl" target="_blank" rel="noopener noreferrer"
              >Open this board in a new tab</a
            >
          </Button>
          <p class="text-sm text-muted-foreground" role="status" v-show="shareStatus">
            {{ shareStatus }}
          </p>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" type="button">Close</Button>
          </DialogClose>
          <Button type="button" @click="copyBoardLink">Copy link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

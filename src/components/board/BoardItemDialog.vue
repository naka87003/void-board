<script setup lang="ts">
import UButton from "@nuxt/ui/components/Button.vue";
import UCheckbox from "@nuxt/ui/components/Checkbox.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import UModal from "@nuxt/ui/components/Modal.vue";
import URadioGroup from "@nuxt/ui/components/RadioGroup.vue";
import UTextarea from "@nuxt/ui/components/Textarea.vue";
import { computed } from "vue";
import {
  colors,
  DEFAULT_LINE_STYLE,
  LINE_PATTERNS,
  LINE_WIDTHS,
  MAX_TEXT,
  TEXT_FONT_SIZES,
  type BoardItem,
  type LineStyle,
  type Note,
  type TextStyle,
} from "../../../shared/board";
import { noteColors } from "./note-colors";

const { editing, pending } = defineProps<{
  connected: boolean;
  editing: boolean;
  conflict: boolean;
  pending?: "save" | "delete";
  error: string;
}>();
const busy = computed(() => pending !== undefined);
const open = defineModel<boolean>("open", { required: true });
const draft = defineModel<BoardItem | undefined>("draft", { required: true });
const emit = defineEmits<{
  save: [];
  overwrite: [];
  remove: [];
  closeAutoFocus: [event: Event];
}>();

const colorOptions = colors.map((value) => ({ value, ...noteColors[value] }));
const sizeOptions = TEXT_FONT_SIZES.map((value) => ({ value, label: `${value} px` }));
const lineOptions = [
  { value: "line" as const, label: "Line" },
  { value: "arrow" as const, label: "Arrow" },
];
const lineWidthLabels = { 1: "Thin", 2: "Standard", 4: "Thick" };
const lineWidthOptions = LINE_WIDTHS.map((value) => ({
  value,
  label: lineWidthLabels[value],
}));
const linePatternOptions = LINE_PATTERNS.map((value) => ({
  value,
  label: value === "solid" ? "Solid" : "Dashed",
}));
const draftLineStyle = computed(() =>
  draft.value?.kind === "line" ? (draft.value.style ?? DEFAULT_LINE_STYLE) : DEFAULT_LINE_STYLE,
);
const canSave = computed(() => draft.value?.kind === "line" || Boolean(draft.value?.text.trim()));
const title = computed(() => {
  if (draft.value?.kind === "line") return editing ? "Edit line" : "Add line";
  if (draft.value?.kind === "text") return editing ? "Edit text" : "Add text";
  return editing ? "Edit sticky note" : "New sticky note";
});
const modalContent = {
  onPointerDownOutside: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: (event: Event) => emit("closeAutoFocus", event),
};

function updateText(text: string) {
  if (draft.value && draft.value.kind !== "line") draft.value = { ...draft.value, text };
}

function updateLine(type: (typeof lineOptions)[number]["value"]) {
  if (draft.value?.kind === "line") draft.value = { ...draft.value, arrow: type === "arrow" };
}

function updateLineStyle(style: Partial<LineStyle>) {
  if (draft.value?.kind === "line") {
    draft.value = { ...draft.value, style: { ...draftLineStyle.value, ...style } };
  }
}

function updateColor(color: Note["color"]) {
  if (draft.value?.kind === "note") draft.value = { ...draft.value, color };
}

function updateTextStyle(style: Partial<TextStyle>) {
  if (draft.value?.kind === "text") {
    draft.value = { ...draft.value, style: { ...draft.value.style, ...style } };
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :close="!busy"
    :dismissible="!busy"
    :content="modalContent"
  >
    <template #body="{ close }">
      <form v-if="draft" class="grid gap-5" @submit.prevent="emit('save')">
        <UFormField
          v-if="draft.kind !== 'line'"
          label="Text"
          :help="`${draft.text.length} / ${MAX_TEXT}`"
          :ui="{ help: 'text-end tabular-nums' }"
        >
          <UTextarea
            :model-value="draft.text"
            @update:model-value="updateText"
            :maxlength="MAX_TEXT"
            autoresize
            :maxrows="8"
            :disabled="busy"
            autofocus
            required
            class="w-full"
          />
        </UFormField>
        <div v-else class="grid gap-4">
          <URadioGroup
            legend="Type"
            variant="table"
            orientation="horizontal"
            :items="lineOptions"
            :model-value="draft.arrow ? 'arrow' : 'line'"
            :disabled="busy"
            @update:model-value="updateLine"
          />
          <URadioGroup
            legend="Thickness"
            variant="table"
            orientation="horizontal"
            :items="lineWidthOptions"
            :model-value="draftLineStyle.width"
            :disabled="busy"
            @update:model-value="updateLineStyle({ width: $event })"
          />
          <URadioGroup
            legend="Line style"
            variant="table"
            orientation="horizontal"
            :items="linePatternOptions"
            :model-value="draftLineStyle.pattern"
            :disabled="busy"
            @update:model-value="updateLineStyle({ pattern: $event })"
          />
        </div>
        <URadioGroup
          v-if="draft.kind === 'note'"
          :model-value="draft.color"
          @update:model-value="updateColor"
          variant="table"
          legend="Color"
          :items="colorOptions"
          :disabled="busy"
        >
          <template #label="{ item }">
            <span class="inline-flex items-center gap-2">
              {{ item.label }}
              <span
                class="size-2.5 rounded-full"
                :style="{ backgroundColor: item.background }"
                aria-hidden="true"
              >
              </span>
            </span>
          </template>
        </URadioGroup>
        <div v-else-if="draft.kind === 'text'" class="grid gap-4">
          <URadioGroup
            legend="Size"
            variant="table"
            :items="sizeOptions"
            :model-value="draft.style.size"
            :disabled="busy"
            @update:model-value="updateTextStyle({ size: $event })"
          />
          <fieldset class="min-w-0">
            <legend class="mb-1 text-sm font-medium text-default">Formatting</legend>
            <div class="flex flex-wrap gap-x-5 gap-y-2">
              <UCheckbox
                label="Bold"
                variant="card"
                :model-value="draft.style.bold"
                :disabled="busy"
                @update:model-value="updateTextStyle({ bold: $event === true })"
              />
              <UCheckbox
                label="Underline"
                variant="card"
                :model-value="draft.style.underline"
                :disabled="busy"
                @update:model-value="updateTextStyle({ underline: $event === true })"
              />
            </div>
          </fieldset>
        </div>
        <p v-if="!connected" class="text-sm text-error" role="status">
          You can make changes once the board reconnects.
        </p>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
        <p v-if="conflict" class="text-sm text-warning" role="alert">
          This item changed while you were editing. You can overwrite it with your draft.
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="editing && !conflict"
            color="error"
            :label="pending === 'delete' ? 'Deleting…' : 'Delete'"
            type="button"
            class="mr-auto"
            :disabled="!connected || busy"
            @click="emit('remove')"
          />
          <UButton
            color="neutral"
            variant="outline"
            label="Cancel"
            :disabled="busy"
            @click="close"
          />
          <UButton
            v-if="conflict"
            :label="pending === 'save' ? 'Saving…' : 'Overwrite'"
            type="button"
            color="warning"
            :disabled="!connected || busy || !canSave"
            @click="emit('overwrite')"
          />
          <UButton
            v-else
            :label="pending === 'save' ? 'Saving…' : 'Save'"
            type="submit"
            :disabled="!connected || busy || !canSave"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>

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
  MAX_TEXT,
  TEXT_FONT_SIZES,
  type BoardItem,
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
const title = computed(() => {
  if (draft.value?.kind === "text") return editing ? "Edit text" : "Add text";
  return editing ? "Edit sticky note" : "New sticky note";
});
const modalContent = {
  onPointerDownOutside: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: (event: Event) => emit("closeAutoFocus", event),
};

function updateText(text: string) {
  if (draft.value) draft.value = { ...draft.value, text };
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
        <URadioGroup
          v-if="draft.kind === 'note'"
          :model-value="draft.color"
          @update:model-value="updateColor"
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
              ></span>
            </span>
          </template>
        </URadioGroup>
        <div v-else class="grid gap-4">
          <URadioGroup
            legend="Size"
            orientation="horizontal"
            :items="sizeOptions"
            :model-value="draft.style.size"
            :disabled="busy"
            @update:model-value="updateTextStyle({ size: $event })"
          />
          <div class="flex flex-wrap gap-x-5 gap-y-2">
            <UCheckbox
              label="Bold"
              :model-value="draft.style.bold"
              :disabled="busy"
              @update:model-value="updateTextStyle({ bold: $event === true })"
            />
            <UCheckbox
              label="Underline"
              :model-value="draft.style.underline"
              :disabled="busy"
              @update:model-value="updateTextStyle({ underline: $event === true })"
            />
          </div>
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
            :disabled="!connected || busy || !draft.text.trim()"
            @click="emit('overwrite')"
          />
          <UButton
            v-else
            :label="pending === 'save' ? 'Saving…' : 'Save'"
            type="submit"
            :disabled="!connected || busy || !draft.text.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>

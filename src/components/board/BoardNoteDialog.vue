<script setup lang="ts">
import UButton from "@nuxt/ui/components/Button.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import UModal from "@nuxt/ui/components/Modal.vue";
import URadioGroup from "@nuxt/ui/components/RadioGroup.vue";
import UTextarea from "@nuxt/ui/components/Textarea.vue";
import { colors, MAX_TEXT, type Note } from "../../../shared/board";
import { noteColors } from "./note-colors";

defineProps<{
  connected: boolean;
  editing: boolean;
  saving: boolean;
  saveError: string;
}>();
const open = defineModel<boolean>("open", { required: true });
const draft = defineModel<Note | undefined>("draft", { required: true });
const emit = defineEmits<{
  save: [];
  remove: [];
  closeAutoFocus: [event: Event];
}>();

const colorOptions = colors.map((value) => ({ value, ...noteColors[value] }));
const modalContent = {
  onPointerDownOutside: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: (event: Event) => emit("closeAutoFocus", event),
};

function updateText(text: string) {
  if (draft.value) draft.value = { ...draft.value, text };
}

function updateColor(color: Note["color"]) {
  if (draft.value) draft.value = { ...draft.value, color };
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editing ? 'Edit note' : 'New note'"
    :close="!saving"
    :dismissible="!saving"
    :content="modalContent"
  >
    <template #body="{ close }">
      <form v-if="draft" class="grid gap-5" @submit.prevent="emit('save')">
        <UFormField label="Text">
          <UTextarea
            :model-value="draft.text"
            @update:model-value="updateText"
            :maxlength="MAX_TEXT"
            :disabled="saving"
            autofocus
            required
            class="w-full"
          />
        </UFormField>
        <URadioGroup
          :model-value="draft.color"
          @update:model-value="updateColor"
          legend="Color"
          :items="colorOptions"
          :disabled="saving"
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
        <p v-if="!connected" class="text-sm text-error" role="status">
          You can save once the board reconnects.
        </p>
        <p v-if="saveError" class="text-sm text-error" role="alert">{{ saveError }}</p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="editing"
            color="error"
            label="Delete"
            class="mr-auto"
            :disabled="!connected || saving"
            @click="emit('remove')"
          />
          <UButton
            color="neutral"
            variant="outline"
            label="Cancel"
            :disabled="saving"
            @click="close"
          />
          <UButton
            :label="saving ? 'Saving…' : 'Save'"
            type="submit"
            :disabled="!connected || saving || !draft.text.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>

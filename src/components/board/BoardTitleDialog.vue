<script setup lang="ts">
import UButton from "@nuxt/ui/components/Button.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import UInput from "@nuxt/ui/components/Input.vue";
import UModal from "@nuxt/ui/components/Modal.vue";
import { useForm } from "@void/vue";
import { ref } from "vue";
import { DEFAULT_BOARD_TITLE, MAX_BOARD_TITLE } from "../../../shared/board";

const { boardId, title, disabled } = defineProps<{
  boardId: string;
  title: string;
  disabled: boolean;
}>();
const form = useForm(
  "/boards/[board]",
  { title: "" },
  {
    params: { board: boardId },
    throwOnError: false,
  },
);
const open = ref(false);
const saveFailed = ref(false);

function updateOpen(value: boolean) {
  if (value) {
    form.data.title = title;
    form.clearErrors();
    form.clearError();
    saveFailed.value = false;
  }
  open.value = value;
}

async function saveTitle() {
  saveFailed.value = false;
  try {
    await form.post();
    if (form.wasSuccessful) open.value = false;
  } catch {
    saveFailed.value = true;
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Rename board"
    :close="!form.pending"
    :dismissible="!form.pending"
    @update:open="updateOpen"
  >
    <UButton
      :label="title"
      :disabled="disabled"
      color="neutral"
      variant="link"
      trailing-icon="i-lucide-pencil"
      aria-description="Rename board"
      class="max-w-full gap-2 p-0 text-left text-xl font-semibold tracking-tight text-highlighted sm:text-2xl"
      :ui="{ label: 'truncate', trailingIcon: 'size-4 shrink-0 text-muted' }"
    />

    <template #body="{ close }">
      <form class="grid gap-5" @submit.prevent="saveTitle">
        <UFormField label="Board name" :error="form.errors.title">
          <UInput
            v-model="form.data.title"
            :maxlength="MAX_BOARD_TITLE"
            :placeholder="DEFAULT_BOARD_TITLE"
            :disabled="form.pending"
            autofocus
            class="w-full"
          />
        </UFormField>
        <p v-if="saveFailed || form.error" class="text-sm text-error" role="alert">
          Couldn’t save the board name. Please try again.
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="form.pending"
            @click="close"
          />
          <UButton label="Save" type="submit" :loading="form.pending" />
        </div>
      </form>
    </template>
  </UModal>
</template>

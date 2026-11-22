<script setup lang="ts">
import UButton from "@nuxt/ui/components/Button.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import UInput from "@nuxt/ui/components/Input.vue";
import UModal from "@nuxt/ui/components/Modal.vue";
import { MAX_NAME } from "../../../shared/board";

defineProps<{ initial: boolean }>();
const open = defineModel<boolean>("open", { required: true });
const draft = defineModel<string>("draft", { required: true });
const emit = defineEmits<{
  save: [name: string];
  closeAutoFocus: [event: Event];
}>();

const modalContent = {
  onPointerDownOutside: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: (event: Event) => emit("closeAutoFocus", event),
};
</script>

<template>
  <UModal
    v-model:open="open"
    :title="initial ? 'Join board' : 'Change display name'"
    :description="
      initial
        ? 'Others on this board will see this name next to your cursor. You can also continue as Guest.'
        : 'Others on this board will see this name next to your cursor.'
    "
    :close="!initial"
    :dismissible="!initial"
    :content="modalContent"
  >
    <template #body="{ close }">
      <form class="grid gap-5" @submit.prevent="emit('save', draft)">
        <UFormField label="Display name">
          <UInput
            v-model="draft"
            :maxlength="MAX_NAME"
            :required="!initial"
            autofocus
            class="w-full"
          />
        </UFormField>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="initial"
            color="neutral"
            variant="outline"
            label="Continue as Guest"
            @click="emit('save', 'Guest')"
          />
          <UButton v-else color="neutral" variant="outline" label="Cancel" @click="close" />
          <UButton
            :label="initial ? 'Join' : 'Save'"
            type="submit"
            :disabled="!initial && !draft.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import UButton from "@nuxt/ui/components/Button.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import UInput from "@nuxt/ui/components/Input.vue";
import UModal from "@nuxt/ui/components/Modal.vue";
import { ref, useTemplateRef } from "vue";

const { url } = defineProps<{ url: string }>();
const shareLink = useTemplateRef("shareLink");
const shareStatus = ref("");
const modalContent = {
  onPointerDownOutside: (event: Event) => event.preventDefault(),
  onOpenAutoFocus: focusBoardLink,
};

function focusBoardLink(event: Event) {
  const input = shareLink.value?.inputRef;
  if (!input) return;
  event.preventDefault();
  input.focus();
  input.setSelectionRange(0, 0);
}

async function copyBoardLink() {
  try {
    await navigator.clipboard.writeText(url);
    shareStatus.value = "Board link copied.";
  } catch {
    const input = shareLink.value?.inputRef;
    input?.focus();
    input?.select();
    shareStatus.value = "Copy the selected link to share this board.";
  }
}
</script>

<template>
  <UModal title="Share board" :content="modalContent" @update:open="shareStatus = ''">
    <UButton color="neutral" variant="outline" label="Share link" />

    <template #body>
      <div class="grid gap-2">
        <UFormField label="Board link">
          <UInput ref="shareLink" :model-value="url" readonly class="w-full" />
        </UFormField>
        <UButton
          variant="link"
          :to="url"
          target="_blank"
          label="Open this board in a new tab"
          class="justify-self-start"
        />
        <p v-show="shareStatus" class="text-sm text-muted" role="status">{{ shareStatus }}</p>
      </div>
    </template>

    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Close" @click="close" />
      <UButton label="Copy link" @click="copyBoardLink" />
    </template>
  </UModal>
</template>

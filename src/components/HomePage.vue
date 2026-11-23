<script setup lang="ts">
import UAlert from "@nuxt/ui/components/Alert.vue";
import UButton from "@nuxt/ui/components/Button.vue";
import UCard from "@nuxt/ui/components/Card.vue";
import UFormField from "@nuxt/ui/components/FormField.vue";
import UInput from "@nuxt/ui/components/Input.vue";
import { useForm } from "@void/vue";
import { ref } from "vue";
import { DEFAULT_BOARD_TITLE, MAX_BOARD_TITLE } from "../../shared/board";
import AppShell from "./AppShell.vue";

defineProps<{ error?: string }>();
const form = useForm("/", { title: "" }, { throwOnError: false });
const createFailed = ref(false);

async function createBoard() {
  createFailed.value = false;
  try {
    await form.post();
  } catch {
    createFailed.value = true;
  }
}
</script>

<template>
  <AppShell>
    <main class="grid flex-1 place-items-center bg-muted p-4 sm:p-6">
      <UCard
        :as="{ title: 'h1' }"
        title="A shared canvas for ideas."
        description="Capture ideas with sticky notes and text, then share a link to work together in real time."
        class="w-full max-w-md"
      >
        <form class="grid gap-4" @submit.prevent="createBoard">
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="error"
            role="alert"
          />
          <UFormField label="Board name" hint="Optional" :error="form.errors.title">
            <UInput
              v-model="form.data.title"
              :maxlength="MAX_BOARD_TITLE"
              :placeholder="DEFAULT_BOARD_TITLE"
              :disabled="form.pending"
              class="w-full"
            />
          </UFormField>
          <p v-if="createFailed || form.error" class="text-sm text-error" role="alert">
            Couldn’t create the board. Please try again.
          </p>
          <UButton
            block
            type="submit"
            icon="i-lucide-plus"
            label="Create a board"
            :loading="form.pending"
          />
        </form>
      </UCard>
    </main>
  </AppShell>
</template>

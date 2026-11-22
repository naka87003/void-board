<script setup lang="ts">
import UAlert from "@nuxt/ui/components/Alert.vue";
import UButton from "@nuxt/ui/components/Button.vue";
import UCard from "@nuxt/ui/components/Card.vue";
import { useRouter } from "@void/vue";
import AppShell from "./AppShell.vue";

defineProps<{ error?: string }>();
const router = useRouter();

function createBoard() {
  return router.visit({ pathname: "/boards/[board]", params: { board: crypto.randomUUID() } });
}
</script>

<template>
  <AppShell>
    <main class="grid flex-1 place-items-center bg-muted p-4 sm:p-6">
      <UCard
        :as="{ title: 'h1' }"
        title="A shared canvas for ideas."
        description="Capture ideas on sticky notes, then share a link to arrange them together in real time."
        class="w-full max-w-md"
      >
        <template v-if="error" #default>
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="error"
            role="alert"
          />
        </template>
        <template #footer>
          <UButton block icon="i-lucide-plus" label="Create a board" @click="createBoard" />
        </template>
      </UCard>
    </main>
  </AppShell>
</template>

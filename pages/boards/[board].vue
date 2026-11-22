<script setup lang="ts">
import HomePage from "@/components/HomePage.vue";
import BoardPage from "@/components/board/BoardPage.vue";
import type { Props } from "./[board].server";

defineProps<Props>();
</script>

<template>
  <BoardPage v-if="boardId" :key="boardId" :board-id="boardId" />
  <HomePage v-else error="This board link is invalid." />
</template>

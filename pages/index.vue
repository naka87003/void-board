<script setup lang="ts">
import HomePage from "@/components/HomePage.vue";
import type { Props } from "./index.server";

defineProps<Props>();
</script>

<template>
  <HomePage :error="error" />
</template>

<script setup lang="ts">
import UApp from "@nuxt/ui/components/App.vue";
import ui from "@nuxt/ui/vue-plugin";
import { getCurrentInstance } from "vue";
import "@/assets/css/main.css";

getCurrentInstance()?.appContext.app.use(ui);
</script>

<template>
  <UApp :toaster="null">
    <slot />
  </UApp>
</template>

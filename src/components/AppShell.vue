<script setup lang="ts">
import { Link } from "@void/vue";
import voidLogo from "@/assets/void-logo.svg";
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b border-default">
      <div
        class="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-2 px-4 sm:px-6"
      >
        <Link
          class="inline-flex shrink-0 items-center rounded-sm"
          href="/"
          aria-label="Void Board home"
        >
          <img :src="voidLogo" class="h-4 w-auto" width="270" height="58" alt="" />
        </Link>
        <slot name="header-actions" />
      </div>
    </header>
    <slot />
  </div>
</template>

import { fileURLToPath } from "node:url";
import ui from "@nuxt/ui/vite";
import { voidVue } from "@void/vue/plugin";
import { defineConfig } from "vite";
import { voidPlugin } from "void";

export default defineConfig({
  plugins: [
    voidPlugin(),
    voidVue(),
    ui({
      router: false,
      colorMode: false,
      ui: { colors: { primary: "neutral", neutral: "neutral" } },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});

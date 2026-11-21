import { defineConfig } from "void/config";

export default defineConfig({
  target: "cloudflare",
  inference: { appType: "void" },
  routing: { typedRoutes: true },
  cloudflare: {
    name: "void-board",
    compatibility_date: "2026-11-16",
    compatibility_flags: ["nodejs_compat"],
    routes: [],
    workers_dev: true,
    preview_urls: true,
  },
});

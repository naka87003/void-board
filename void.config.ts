import { defineConfig } from "void/config";

export default defineConfig({
  target: "cloudflare",
  inference: { appType: "void" },
  routing: { typedRoutes: true },
  head: {
    title: "Void Board — A shared canvas for ideas",
    htmlAttrs: { lang: "en", class: "dark" },
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "referrer", content: "no-referrer" },
      { name: "theme-color", content: "#171717" },
    ],
    link: [{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" }],
  },
  worker: {
    compatibility_date: "2026-11-16",
    compatibility_flags: ["nodejs_compat"],
  },
  cloudflare: {
    name: "void-board",
    routes: [],
    workers_dev: true,
    preview_urls: true,
  },
});

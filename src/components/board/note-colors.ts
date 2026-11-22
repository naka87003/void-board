import type { Note } from "../../../shared/board";

export const noteColors = {
  yellow: { label: "Yellow", background: "#ffe891" },
  mint: { label: "Mint", background: "#c5ead8" },
  lilac: { label: "Lilac", background: "#ded2fb" },
  peach: { label: "Peach", background: "#ffcfbe" },
} satisfies Record<Note["color"], { label: string; background: string }>;

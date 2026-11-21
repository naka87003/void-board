import { describe, expect, it } from "vite-plus/test";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clientMessage,
  MAX_NAME,
  MAX_TEXT,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  serverMessage,
  type Note,
} from "./board";

const note = {
  id: "00000000-0000-4000-8000-000000000001",
  text: "An idea",
  color: "yellow",
  x: BOARD_WIDTH - NOTE_WIDTH,
  y: BOARD_HEIGHT - NOTE_HEIGHT,
} satisfies Note;
const requestId = "00000000-0000-4000-8000-000000000002";

describe("client messages", () => {
  it("accepts a note at the edge of the board with an optional request ID", () => {
    const message = { type: "note.add", note };

    expect(clientMessage.parse(message)).toEqual(message);
    expect(clientMessage.parse({ ...message, requestId })).toEqual({ ...message, requestId });
  });

  it.each([
    { id: "invalid-id" },
    { color: "blue" },
    { x: -1 },
    { x: 0.5 },
    { x: BOARD_WIDTH - NOTE_WIDTH + 1 },
    { y: BOARD_HEIGHT - NOTE_HEIGHT + 1 },
  ])("rejects a note with invalid fields %j", (fields) => {
    expect(
      clientMessage.safeParse({ type: "note.add", note: { ...note, ...fields } }).success,
    ).toBe(false);
  });

  it("enforces the note text limit in UTF-16 code units", () => {
    const text = "😀".repeat(MAX_TEXT / 2);
    const message = { type: "note.edit", id: note.id, color: note.color, text };

    expect(clientMessage.parse(message)).toEqual(message);
    expect(clientMessage.safeParse({ ...message, text: text + "a" }).success).toBe(false);
  });

  it("trims display names and allows cursors at the board edge or absent", () => {
    const name = "😀".repeat(MAX_NAME / 2);
    const message = { type: "presence.cursor", name, cursor: { x: BOARD_WIDTH, y: BOARD_HEIGHT } };

    expect(clientMessage.parse({ ...message, name: ` ${name} ` })).toEqual(message);
    const hiddenCursor = { ...message, cursor: null };
    expect(clientMessage.parse(hiddenCursor)).toEqual(hiddenCursor);
    expect(clientMessage.safeParse({ ...message, name: "   " }).success).toBe(false);
    expect(clientMessage.safeParse({ ...message, name: name + "a" }).success).toBe(false);
  });
});

describe("server messages", () => {
  it("validates notes inside a board snapshot", () => {
    const snapshot = { type: "board.snapshot", notes: [note] };

    expect(serverMessage.parse(snapshot)).toEqual(snapshot);
    expect(
      serverMessage.safeParse({ ...snapshot, notes: [{ ...note, id: "invalid" }] }).success,
    ).toBe(false);
  });

  it("preserves the request ID on save acknowledgements and board errors", () => {
    const acknowledgement = { type: "note.updated", note, requestId };
    const error = { type: "board.error", reason: "storage", requestId };

    expect(serverMessage.parse(acknowledgement)).toEqual(acknowledgement);
    expect(serverMessage.parse(error)).toEqual(error);
    expect(serverMessage.safeParse({ ...error, requestId: "invalid" }).success).toBe(false);
  });
});

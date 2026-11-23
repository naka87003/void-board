import { describe, expect, it } from "vite-plus/test";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  boardTitleForm,
  clientMessage,
  DEFAULT_BOARD_TITLE,
  MAX_BOARD_TITLE,
  MAX_NAME,
  MAX_TEXT,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  sameItemContent,
  serverMessage,
  type BoardItem,
  type Note,
} from "./board";

const note = {
  kind: "note",
  id: "00000000-0000-4000-8000-000000000001",
  text: "An idea",
  color: "yellow",
  x: BOARD_WIDTH - NOTE_WIDTH,
  y: BOARD_HEIGHT - NOTE_HEIGHT,
} satisfies Note;
const requestId = "00000000-0000-4000-8000-000000000002";
const textItem = {
  kind: "text",
  id: "00000000-0000-4000-8000-000000000003",
  text: "Next steps",
  style: { size: 24, bold: true, underline: true },
  x: note.x,
  y: note.y,
} satisfies BoardItem;

it("accepts a blank or trimmed board name and rejects names over the limit", () => {
  expect(boardTitleForm.parse({ title: "  " })).toEqual({ title: "" });
  expect(boardTitleForm.parse({ title: "  Planning  " })).toEqual({ title: "Planning" });
  expect(boardTitleForm.safeParse({ title: "a".repeat(MAX_BOARD_TITLE + 1) }).success).toBe(false);
});

describe("client messages", () => {
  it("accepts a note at the edge of the board with an optional request ID", () => {
    const message = { type: "item.add", item: note };

    expect(clientMessage.parse(message)).toEqual(message);
    expect(clientMessage.parse({ ...message, requestId })).toEqual({ ...message, requestId });
  });

  it.each([
    { id: "invalid-id" },
    { kind: undefined },
    { color: "blue" },
    { x: -1 },
    { x: 0.5 },
    { x: BOARD_WIDTH - NOTE_WIDTH + 1 },
    { y: BOARD_HEIGHT - NOTE_HEIGHT + 1 },
  ])("rejects a note with invalid fields %j", (fields) => {
    expect(
      clientMessage.safeParse({ type: "item.add", item: { ...note, ...fields } }).success,
    ).toBe(false);
  });

  it("enforces the note text limit in UTF-16 code units", () => {
    const text = "😀".repeat(MAX_TEXT / 2);
    const content = { kind: note.kind, color: note.color, text };
    const baseContent = { kind: note.kind, text: note.text, color: note.color };
    const message = { type: "item.edit", id: note.id, content, baseContent, requestId };

    expect(clientMessage.parse(message)).toEqual(message);
    expect(
      clientMessage.safeParse({ ...message, content: { ...content, text: text + "a" } }).success,
    ).toBe(false);
  });

  it("preserves text formatting in add and edit messages", () => {
    const add = { type: "item.add", item: textItem, requestId };
    const content = {
      kind: "text",
      text: "Decisions",
      style: { size: 14, bold: false, underline: true },
    };
    const baseContent = { kind: textItem.kind, text: textItem.text, style: textItem.style };
    const edit = { type: "item.edit", id: textItem.id, content, baseContent, requestId };

    expect(clientMessage.parse(add)).toEqual(add);
    expect(clientMessage.parse(edit)).toEqual(edit);
    const overwrite = { ...edit, baseContent: null };
    expect(clientMessage.parse(overwrite)).toEqual(overwrite);
    expect(clientMessage.safeParse({ ...edit, baseContent: undefined }).success).toBe(false);
    expect(
      clientMessage.safeParse({ ...add, item: { ...textItem, style: undefined } }).success,
    ).toBe(false);
    expect(
      clientMessage.safeParse({ ...edit, content: { ...content, kind: undefined } }).success,
    ).toBe(false);
    expect(
      clientMessage.safeParse({
        ...edit,
        content: { ...content, style: { ...content.style, size: 100 } },
      }).success,
    ).toBe(false);
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

it("compares content independently of position and detects formatting changes", () => {
  const moved = { ...textItem, x: 0, y: 0 };
  expect(sameItemContent(textItem, moved)).toBe(true);
  expect(sameItemContent(textItem, { ...moved, style: { ...moved.style, bold: false } })).toBe(
    false,
  );
});

describe("server messages", () => {
  it("validates items inside a board snapshot", () => {
    const snapshot = { type: "board.snapshot", title: DEFAULT_BOARD_TITLE, items: [note] };

    expect(serverMessage.parse(snapshot)).toEqual(snapshot);
    expect(
      serverMessage.safeParse({ ...snapshot, items: [{ ...note, id: "invalid" }] }).success,
    ).toBe(false);
  });

  it("preserves both sticky notes and text in snapshots", () => {
    const snapshot = { type: "board.snapshot", title: "Planning", items: [note, textItem] };

    expect(serverMessage.parse(snapshot)).toEqual(snapshot);
  });

  it("preserves the request ID on save acknowledgements and board errors", () => {
    const acknowledgement = { type: "item.updated", item: note, requestId };
    const error = { type: "board.error", reason: "storage", requestId };

    expect(serverMessage.parse(acknowledgement)).toEqual(acknowledgement);
    expect(serverMessage.parse(error)).toEqual(error);
    expect(serverMessage.safeParse({ ...error, requestId: "invalid" }).success).toBe(false);
  });
});

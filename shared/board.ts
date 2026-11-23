import * as z from "zod";

export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1000;
export const NOTE_WIDTH = 184;
export const NOTE_HEIGHT = 168;
export const MAX_TEXT = 480;
export const MAX_ITEMS = 120;
export const MAX_NAME = 32;
export const MAX_BOARD_TITLE = 80;
export const DEFAULT_BOARD_TITLE = "Untitled board";
export const TEXT_FONT_SIZES = [14, 18, 24] as const;

const boardTitle = z.string().trim().max(MAX_BOARD_TITLE);
export const boardTitleForm = z.object({ title: boardTitle });

export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const id = z.string().regex(idPattern);
const requestId = id.optional();
export const colors = ["yellow", "mint", "lilac", "peach"] as const;
// Match the UTF-16 length limits used by the form inputs.
const text = z.string().refine((value) => value.length <= MAX_TEXT);
const noteContent = z.object({ kind: z.literal("note"), text, color: z.enum(colors) });
const textStyle = z.object({
  size: z.literal(TEXT_FONT_SIZES),
  bold: z.boolean(),
  underline: z.boolean(),
});
export const DEFAULT_TEXT_STYLE = { size: 18, bold: false, underline: false } satisfies TextStyle;
const textContent = z.object({
  kind: z.literal("text"),
  text,
  style: textStyle,
});
const itemContent = z.discriminatedUnion("kind", [noteContent, textContent]);
const coordinate = (maximum: number) => z.int().min(0).max(maximum);
const position = {
  x: coordinate(BOARD_WIDTH - NOTE_WIDTH),
  y: coordinate(BOARD_HEIGHT - NOTE_HEIGHT),
};
const note = noteContent.extend({ id, ...position });
const boardItem = z.discriminatedUnion("kind", [note, textContent.extend({ id, ...position })]);
const cursor = z.object({ x: coordinate(BOARD_WIDTH), y: coordinate(BOARD_HEIGHT) }).nullable();
const name = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.length <= MAX_NAME);
const drag = { id, ...position };
export const clientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("board.sync"), requestId }),
  z.object({ type: z.literal("item.add"), item: boardItem, requestId }),
  z.object({
    type: z.literal("item.edit"),
    id,
    content: itemContent,
    baseContent: itemContent.nullable(),
    requestId: id,
  }),
  z.object({ type: z.literal("item.move"), id, ...position, requestId }),
  z.object({ type: z.literal("item.remove"), id, requestId: id }),
  z.object({ type: z.literal("presence.cursor"), name, cursor }),
  z.object({ type: z.literal("presence.drag"), ...drag }),
  z.object({ type: z.literal("presence.drag-cancelled") }),
]);

export const serverMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("board.snapshot"),
    title: boardTitle,
    items: z.array(boardItem),
    requestId,
  }),
  z.object({ type: z.literal("board.title"), title: boardTitle }),
  z.object({ type: z.literal("item.updated"), item: boardItem, movedBy: id.optional(), requestId }),
  z.object({ type: z.literal("item.removed"), id, requestId }),
  z.object({
    type: z.literal("board.error"),
    reason: z.enum(["full", "missing", "kind", "conflict", "storage"]),
    requestId,
  }),
  z.object({ type: z.literal("presence.request") }),
  z.object({ type: z.literal("presence.cursor"), peer: id, name, cursor }),
  z.object({ type: z.literal("presence.drag"), peer: id, ...drag }),
  z.object({ type: z.literal("presence.drag-cancelled"), peer: id }),
  z.object({ type: z.literal("presence.left"), peer: id }),
]);

export type Note = z.infer<typeof note>;
export type TextStyle = z.infer<typeof textStyle>;
export type BoardItem = z.infer<typeof boardItem>;
export type ItemContent = z.infer<typeof itemContent>;
export type ClientMessage = z.infer<typeof clientMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type Cursor = NonNullable<z.infer<typeof cursor>>;

export function sameItemContent(first: ItemContent, second: ItemContent) {
  if (first.text !== second.text) return false;
  if (first.kind === "note" && second.kind === "note") return first.color === second.color;
  return (
    first.kind === "text" &&
    second.kind === "text" &&
    first.style.size === second.style.size &&
    first.style.bold === second.style.bold &&
    first.style.underline === second.style.underline
  );
}

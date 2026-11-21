import * as z from "zod";

export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1000;
export const NOTE_WIDTH = 184;
export const NOTE_HEIGHT = 168;
export const MAX_TEXT = 480;
export const MAX_NOTES = 120;
export const MAX_NAME = 32;

export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const id = z.string().regex(idPattern);
const requestId = id.optional();
export const colors = ["yellow", "mint", "lilac", "peach"] as const;
// Match the UTF-16 length limits used by the form inputs.
const appearance = {
  text: z.string().refine((value) => value.length <= MAX_TEXT),
  color: z.enum(colors),
};
const coordinate = (maximum: number) => z.int().min(0).max(maximum);
const position = {
  x: coordinate(BOARD_WIDTH - NOTE_WIDTH),
  y: coordinate(BOARD_HEIGHT - NOTE_HEIGHT),
};
const note = z.object({ id, ...appearance, ...position });
const cursor = z.object({ x: coordinate(BOARD_WIDTH), y: coordinate(BOARD_HEIGHT) }).nullable();
const name = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.length <= MAX_NAME);
const drag = { id, ...position };

export const clientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("note.add"), note, requestId }),
  z.object({ type: z.literal("note.edit"), id, ...appearance, requestId }),
  z.object({ type: z.literal("note.move"), id, ...position }),
  z.object({ type: z.literal("note.remove"), id }),
  z.object({ type: z.literal("presence.cursor"), name, cursor }),
  z.object({ type: z.literal("presence.drag"), ...drag }),
  z.object({ type: z.literal("presence.drag-cancelled") }),
]);

export const serverMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("board.snapshot"), notes: z.array(note) }),
  z.object({ type: z.literal("note.updated"), note, movedBy: id.optional(), requestId }),
  z.object({ type: z.literal("note.removed"), id }),
  z.object({
    type: z.literal("board.error"),
    reason: z.enum(["full", "missing", "storage"]),
    requestId,
  }),
  z.object({ type: z.literal("presence.request") }),
  z.object({ type: z.literal("presence.cursor"), peer: id, name, cursor }),
  z.object({ type: z.literal("presence.drag"), peer: id, ...drag }),
  z.object({ type: z.literal("presence.drag-cancelled"), peer: id }),
  z.object({ type: z.literal("presence.left"), peer: id }),
]);

export type Note = z.infer<typeof note>;
export type ClientMessage = z.infer<typeof clientMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type Cursor = NonNullable<z.infer<typeof cursor>>;

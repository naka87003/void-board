import { defineRoom } from "void/ws";
import { clientMessage, idPattern, MAX_NOTES, serverMessage, type Note } from "../../shared/board";

const notePrefix = "note:";

export default defineRoom({
  messages: { client: clientMessage, server: serverMessage },

  onBeforeConnect(ctx) {
    if (!idPattern.test(ctx.params.board)) {
      return new Response("Board not found", { status: 404 });
    }
  },

  async onConnect(ctx) {
    const notes = await ctx.storage.list<Note>({ prefix: notePrefix });
    await ctx.connection.send({ type: "board.snapshot", notes: [...notes.values()] });
    await ctx.room.broadcast({ type: "presence.request" }, [ctx.connection.id]);
  },

  async onClose(ctx) {
    await ctx.room.broadcast({ type: "presence.left", peer: ctx.connection.id }, [
      ctx.connection.id,
    ]);
  },

  async onMessage(ctx, event) {
    const peer = ctx.connection.id;
    switch (event.type) {
      case "presence.cursor":
      case "presence.drag":
      case "presence.drag-cancelled":
        await ctx.room.broadcast({ ...event, peer }, [peer]);
        return;
    }

    const id = event.type === "note.add" ? event.note.id : event.id;
    const key = notePrefix + id;
    const requestId = "requestId" in event ? event.requestId : undefined;

    let result;
    try {
      // Keep the capacity check and each note change atomic across live connections.
      result = await ctx.storage.transaction(async (txn) => {
        const existing = await txn.get<Note>(key);

        if (event.type === "note.add") {
          if (existing) return { type: "note.updated", note: existing } as const;
          const notes = await txn.list({ prefix: notePrefix, limit: MAX_NOTES });
          if (notes.size >= MAX_NOTES) return { type: "board.error", reason: "full" } as const;

          await txn.put(key, event.note);
          return { type: "note.updated", note: event.note } as const;
        }

        if (!existing) return { type: "board.error", reason: "missing" } as const;

        if (event.type === "note.remove") {
          await txn.delete(key);
          return { type: "note.removed", id } as const;
        }

        const note =
          event.type === "note.move"
            ? { ...existing, x: event.x, y: event.y }
            : { ...existing, text: event.text, color: event.color };

        await txn.put(key, note);
        return event.type === "note.move"
          ? ({ type: "note.updated", note, movedBy: peer } as const)
          : ({ type: "note.updated", note } as const);
      });
    } catch (error) {
      console.error("Unable to update board", error);
      result = { type: "board.error", reason: "storage" } as const;
    }

    if (result.type === "board.error") {
      if (event.type === "note.move") {
        await ctx.room.broadcast({ type: "presence.drag-cancelled", peer }, [peer]);
      }
      await ctx.connection.send({ ...result, requestId });
    } else if (result.type === "note.updated" && requestId) {
      await Promise.all([
        ctx.room.broadcast(result, [peer]),
        ctx.connection.send({ ...result, requestId }),
      ]);
    } else {
      await ctx.room.broadcast(result);
    }
  },
});

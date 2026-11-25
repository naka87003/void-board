import { defineRoom, type RoomController } from "void/ws";
import {
  clientMessage,
  DEFAULT_BOARD_TITLE,
  idPattern,
  MAX_ITEMS,
  sameItemContent,
  sameLineGeometry,
  serverMessage,
  validItemPosition,
  type BoardItem,
  type ServerMessage,
} from "../../shared/board";

const itemPrefix = "item:";
const titleKey = "title";

async function readBoard(storage: DurableObjectStorage) {
  const [title, items] = await Promise.all([
    storage.get<string>(titleKey),
    storage.list<BoardItem>({ prefix: itemPrefix }),
  ]);
  return { title: title ?? DEFAULT_BOARD_TITLE, items: [...items.values()] };
}

async function notifyPeers(
  room: Pick<RoomController, "getConnections">,
  message: ServerMessage,
  excludedPeer?: string,
) {
  // A closing socket must not interrupt notifications to the rest of the room.
  await Promise.allSettled(
    Array.from(room.getConnections(), async (connection) => {
      if (connection.id !== excludedPeer) await connection.send(message);
    }),
  );
}

export default defineRoom({
  messages: { client: clientMessage, server: serverMessage },

  actions: {
    async setTitle(ctx, name: string) {
      const title = name || DEFAULT_BOARD_TITLE;
      await ctx.storage.put(titleKey, title);
      await notifyPeers(ctx.room, { type: "board.title", title });
    },
  },

  onBeforeConnect(ctx) {
    if (!idPattern.test(ctx.params.board)) {
      return new Response("Board not found", { status: 404 });
    }
  },

  async onConnect(ctx) {
    const board = await readBoard(ctx.storage);
    await ctx.connection.send({ type: "board.snapshot", ...board });
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
      case "board.sync": {
        let board;
        try {
          board = await readBoard(ctx.storage);
        } catch (error) {
          console.error("Unable to read board", error);
          await ctx.connection.send({
            type: "board.error",
            reason: "storage",
            requestId: event.requestId,
          });
          return;
        }
        await ctx.connection.send({
          type: "board.snapshot",
          ...board,
          requestId: event.requestId,
        });
        return;
      }
      case "presence.cursor":
      case "presence.drag":
      case "presence.drag-cancelled":
        await ctx.room.broadcast({ ...event, peer }, [peer]);
        return;
    }

    const id = event.type === "item.add" ? event.item.id : event.id;
    const key = itemPrefix + id;
    const requestId = event.requestId;

    let result;
    try {
      // Keep the capacity check and each item change atomic across live connections.
      result = await ctx.storage.transaction(async (txn) => {
        if (event.type === "item.remove") {
          await txn.delete(key);
          return { type: "item.removed", id } as const;
        }

        const existing = await txn.get<BoardItem>(key);

        if (event.type === "item.add") {
          if (existing) return { type: "item.updated", item: existing } as const;
          const items = await txn.list({ prefix: itemPrefix, limit: MAX_ITEMS });
          if (items.size >= MAX_ITEMS) return { type: "board.error", reason: "full" } as const;

          await txn.put(key, event.item);
          return { type: "item.updated", item: event.item } as const;
        }

        if (!existing) return { type: "board.error", reason: "missing" } as const;

        if (event.type === "item.move") {
          const item = { ...existing, x: event.x, y: event.y };
          if (!validItemPosition(item, item.kind === "line" ? item : undefined)) {
            return { type: "board.error", reason: "position" } as const;
          }
          await txn.put(key, item);
          return { type: "item.updated", item, movedBy: peer } as const;
        }

        if (event.type === "item.resize") {
          if (existing.kind !== "line") return { type: "board.error", reason: "kind" } as const;
          if (sameLineGeometry(existing, event.geometry)) {
            return { type: "item.updated", item: existing, movedBy: peer } as const;
          }
          if (!sameLineGeometry(existing, event.base)) {
            return { type: "board.error", reason: "conflict" } as const;
          }
          const item = { ...existing, ...event.geometry };
          await txn.put(key, item);
          return { type: "item.updated", item, movedBy: peer } as const;
        }

        if (event.content.kind !== existing.kind) {
          return { type: "board.error", reason: "kind" } as const;
        }
        if (sameItemContent(existing, event.content)) {
          return { type: "item.updated", item: existing } as const;
        }
        if (event.baseContent && !sameItemContent(existing, event.baseContent)) {
          return { type: "board.error", reason: "conflict" } as const;
        }
        let item;
        if (event.content.kind !== "line") {
          item = { ...event.content, id, x: existing.x, y: existing.y };
        } else if (existing.kind === "line") {
          item = { ...existing, ...event.content };
        } else {
          return { type: "board.error", reason: "kind" } as const;
        }
        await txn.put(key, item);
        return { type: "item.updated", item } as const;
      });
    } catch (error) {
      console.error("Unable to update board", error);
      result = { type: "board.error", reason: "storage" } as const;
    }

    if (result.type === "board.error") {
      if (event.type === "item.move") {
        await notifyPeers(ctx.room, { type: "presence.drag-cancelled", peer }, peer);
      }
      await ctx.connection.send({ ...result, requestId });
    } else if (requestId) {
      await Promise.allSettled([
        notifyPeers(ctx.room, result, peer),
        ctx.connection.send({ ...result, requestId }),
      ]);
    } else {
      await notifyPeers(ctx.room, result);
    }
  },
});

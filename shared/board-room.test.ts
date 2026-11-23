import { expect, it, vi } from "vite-plus/test";
import boardRoom from "../routes/boards/[board].ws";
import type { ServerMessage } from "./board";

const id = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const senderId = "00000000-0000-4000-8000-000000000003";
const onMessage = boardRoom.onMessage!;

function setupRoom() {
  const sender = { id: senderId, send: vi.fn().mockResolvedValue(undefined) };
  const closing = { id: "closing", send: vi.fn().mockRejectedValue(new Error("Socket closed")) };
  const peer = { id: "peer", send: vi.fn().mockResolvedValue(undefined) };
  const connections = [closing, peer, sender];
  const transaction = { delete: vi.fn().mockResolvedValue(true), get: vi.fn() };
  const context = {
    connection: sender,
    room: {
      getConnections: () => connections,
      async broadcast(message: ServerMessage, excluded: string[] = []) {
        for (const connection of connections) {
          if (!excluded.includes(connection.id)) await connection.send(message);
        }
      },
    },
    storage: {
      transaction: (run: (txn: typeof transaction) => unknown) => run(transaction),
    },
  } as unknown as Parameters<typeof onMessage>[0];

  return { context, sender, closing, peer, transaction };
}

it("acknowledges and announces a deletion even when one peer cannot receive it", async () => {
  const { context, sender, closing, peer, transaction } = setupRoom();
  await onMessage(context, { type: "item.remove", id, requestId });

  const notification = { type: "item.removed", id };
  expect(transaction.delete).toHaveBeenCalledExactlyOnceWith(`item:${id}`);
  expect(closing.send).toHaveBeenCalledExactlyOnceWith(notification);
  expect(peer.send).toHaveBeenCalledExactlyOnceWith(notification);
  expect(sender.send).toHaveBeenCalledExactlyOnceWith({ ...notification, requestId });
});

it("reports a failed move even when a peer cannot receive the drag cancellation", async () => {
  const { context, sender, peer } = setupRoom();
  await onMessage(context, { type: "item.move", id, x: 10, y: 10, requestId });

  expect(peer.send).toHaveBeenCalledExactlyOnceWith({
    type: "presence.drag-cancelled",
    peer: senderId,
  });
  expect(sender.send).toHaveBeenCalledExactlyOnceWith({
    type: "board.error",
    reason: "missing",
    requestId,
  });
});

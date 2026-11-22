import { defineHandler, type InferProps } from "void/handler";
import { idPattern } from "../../shared/board";

// The board uses browser storage and joins a room after it mounts.
export const ssr = false;

export type Props = InferProps<typeof loader>;

export const loader = defineHandler((c) => {
  const boardId = c.req.param("board");
  if (!boardId || !idPattern.test(boardId)) {
    c.status(404);
    return { boardId: null };
  }

  return { boardId };
});

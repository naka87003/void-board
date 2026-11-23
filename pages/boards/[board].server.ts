import { defineHandler, type InferProps } from "void/handler";
import { getRoom } from "void/ws/server";
import { boardTitleForm, idPattern } from "../../shared/board";

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

export const action = defineHandler.withValidator({ body: boardTitleForm })(async (c, { body }) => {
  const board = c.req.param("board");
  if (!board || !idPattern.test(board)) return c.text("This board link is invalid.", 404);

  await getRoom("/boards/[board]", { params: { board } }).actions.setTitle(body.title);
});

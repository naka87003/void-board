import { defineHandler, type InferProps } from "void/handler";
import { routeUrl } from "void/routes";
import { idPattern } from "../shared/board";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler((c) => {
  const url = new URL(c.req.url);
  const board = url.searchParams.get("board");
  if (board && idPattern.test(board)) {
    url.pathname = routeUrl("/boards/[board]", { params: { board } });
    url.searchParams.delete("board");
    return c.redirect(url);
  }

  return { error: board === null ? undefined : "This board link is invalid." };
});

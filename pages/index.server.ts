import { defineHandler } from "void/handler";
import { routeUrl } from "void/routes";
import { getRoom } from "void/ws/server";
import { boardTitleForm } from "../shared/board";

export const action = defineHandler.withValidator({ body: boardTitleForm })(async (c, { body }) => {
  const board = crypto.randomUUID();
  if (body.title) {
    await getRoom("/boards/[board]", { params: { board } }).actions.setTitle(body.title);
  }
  return c.redirect(routeUrl("/boards/[board]", { params: { board } }), 303);
});

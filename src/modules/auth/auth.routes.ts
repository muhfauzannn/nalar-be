import { Hono } from "hono";

import { auth } from "./auth";

export const authRoutes = new Hono().on(["GET", "POST"], "/*", (context) => {
  return auth.handler(context.req.raw);
});

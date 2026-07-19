import { createMiddleware } from "hono/factory";

import { auth, type AuthSession } from "./auth";

export type AuthVariables = {
  session: AuthSession;
};

export const requireSession = createMiddleware<{ Variables: AuthVariables }>(
  async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) {
      return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401);
    }

    context.set("session", session);
    await next();
  },
);

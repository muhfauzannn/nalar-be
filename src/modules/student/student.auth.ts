import { createMiddleware } from "hono/factory";

import { auth, type AuthSession } from "../auth/auth";

export type StudentVariables = {
  session: AuthSession;
};

export const requireSession = createMiddleware<{ Variables: StudentVariables }>(
  async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) {
      return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401);
    }

    context.set("session", session);
    await next();
  },
);

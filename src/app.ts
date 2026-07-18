import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";

const app = new Hono();

app.use(
  "/api/auth/*",
  cors({
    origin: env.frontendUrl,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.route("/api/auth", authRoutes);

export default app;

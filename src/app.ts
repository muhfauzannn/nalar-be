import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { RequestValidationError, studentRoutes } from "./modules/student/student.routes";
import { StudentServiceError } from "./modules/student/student.service";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: env.frontendUrl,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/student", studentRoutes);

app.onError((error, context) => {
  if (error instanceof StudentServiceError || error instanceof RequestValidationError) {
    return context.json({ error: error.message }, error.status);
  }
  return context.json({ error: "Terjadi kesalahan pada server." }, 500);
});

export default app;

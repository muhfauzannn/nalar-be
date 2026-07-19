import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { AiTutorRequestError, aiTutorRoutes } from "./modules/ai-tutor/ai-tutor.routes";
import { AiTutorServiceError } from "./modules/ai-tutor/ai-tutor.service";
import { RequestValidationError, studentRoutes } from "./modules/student/student.routes";
import { StudentServiceError } from "./modules/student/student.service";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: [...env.trustedOrigins],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Server-Timing"],
    credentials: true,
    maxAge: 600,
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/student/ai-tutor", aiTutorRoutes);
app.route("/api/student", studentRoutes);

app.onError((error, context) => {
  if (error instanceof StudentServiceError) {
    return context.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}) },
      error.status,
    );
  }
  if (error instanceof AiTutorServiceError) {
    return context.json(
      { error: error.message, code: error.code },
      error.status,
    );
  }
  if (error instanceof AiTutorRequestError) {
    return context.json({ error: error.message }, error.status);
  }
  if (error instanceof RequestValidationError) {
    return context.json({ error: error.message }, error.status);
  }
  return context.json({ error: "Terjadi kesalahan pada server." }, 500);
});

export default app;

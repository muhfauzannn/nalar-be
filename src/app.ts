import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { authoringRoutes } from "./modules/authoring/authoring.routes";
import {
  AuthoringRequestError,
  AuthoringServiceError,
} from "./modules/authoring/authoring.shared";
import { StorageUnavailableError } from "./lib/file-storage";
import { enrollmentRoutes } from "./modules/enrollment/enrollment.routes";
import { EnrollmentServiceError } from "./modules/enrollment/enrollment.service";
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
app.route("/api/courses", enrollmentRoutes);
app.route("/api/manage", authoringRoutes);

app.onError((error, context) => {
  if (error instanceof AuthoringServiceError) {
    return context.json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof AuthoringRequestError) {
    return context.json({ error: error.message }, error.status);
  }
  if (error instanceof EnrollmentServiceError) {
    if (error.retryAfterSeconds) {
      context.header("Retry-After", String(error.retryAfterSeconds));
    }
    return context.json({ error: error.message, code: error.code }, error.status);
  }
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
  if (error instanceof StorageUnavailableError) {
    return context.json({ error: error.message, code: "STORAGE_UNAVAILABLE" }, 503);
  }
  return context.json({ error: "Terjadi kesalahan pada server." }, 500);
});

export default app;

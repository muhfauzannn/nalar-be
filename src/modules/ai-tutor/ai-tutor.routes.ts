import { Hono } from "hono";

import { logEvent, redact } from "../../lib/log";
import { createRateLimiter } from "../../lib/rate-limit";
import { requireSession, type AuthVariables } from "../auth/auth.middleware";
import {
  classifyAiTutorPrompt,
  createAiTutorSession,
  getAiTutorMessages,
  saveAiTutorReply,
} from "./ai-tutor.service";
import type { TutorMode } from "./ai-tutor.repository";
import { createPdfTutorSession } from "./pdf-tutor.service";

export const aiTutorRoutes = new Hono<{ Variables: AuthVariables }>();

aiTutorRoutes.use("*", requireSession);

aiTutorRoutes.post("/pdf-sessions", async (context) => {
  const body = await readObject(context.req.raw);
  context.header("Cache-Control", "no-store");
  return context.json(await createPdfTutorSession(
    context.get("session").user.id,
    requiredId(body.resourceId, "ID PDF"),
  ), 201);
});

aiTutorRoutes.post("/sessions", async (context) => {
  const body = await readObject(context.req.raw);
  const mode = tutorMode(body.mode);
  const targetType = body.targetType;
  const targetId = requiredId(body.targetId, "ID aktivitas");

  if (targetType === "assignment") {
    return context.json(
      await createAiTutorSession({
        userId: context.get("session").user.id,
        target: { targetType, targetId },
        mode,
      }),
      201,
    );
  }
  if (targetType === "quiz") {
    return context.json(
      await createAiTutorSession({
        userId: context.get("session").user.id,
        target: {
          targetType,
          targetId,
          questionId: requiredId(body.questionId, "ID soal"),
        },
        mode,
      }),
      201,
    );
  }
  throw new AiTutorRequestError("Jenis aktivitas AI Tutor tidak valid.");
});

aiTutorRoutes.get("/conversations/:conversationId/messages", async (context) =>
  context.json(
    await getAiTutorMessages({
      userId: context.get("session").user.id,
      conversationId: requiredId(
        context.req.param("conversationId"),
        "ID percakapan",
      ),
    }),
  ),
);

aiTutorRoutes.post(
  "/conversations/:conversationId/classifications",
  async (context) => {
    const body = await readObject(context.req.raw);
    const result = await classifyAiTutorPrompt({
      userId: context.get("session").user.id,
      conversationId: requiredId(
        context.req.param("conversationId"),
        "ID percakapan",
      ),
      clientEventId: requiredId(body.clientEventId, "ID event"),
      questionId: optionalId(body.questionId, "ID soal"),
      content: requiredString(body.content, "Pesan siswa"),
      mode: tutorMode(body.mode),
    });
    context.header("Server-Timing", classificationServerTiming(result.timing));
    return context.json(result.data, 201);
  },
);

aiTutorRoutes.post("/conversations/:conversationId/replies", async (context) => {
  const body = await readObject(context.req.raw);
  return context.json(
    await saveAiTutorReply({
      userId: context.get("session").user.id,
      conversationId: requiredId(
        context.req.param("conversationId"),
        "ID percakapan",
      ),
      clientEventId: requiredId(body.clientEventId, "ID event"),
      inReplyToEventId: requiredId(body.inReplyToEventId, "ID pesan siswa"),
      questionId: optionalId(body.questionId, "ID soal"),
      content: requiredString(body.content, "Respons tutor"),
      mode: tutorMode(body.mode),
    }),
    201,
  );
});

// The browser talks to Gemini directly, so a refused or dropped Live socket never reaches this
// server. The client reports those here so they land in the same logs as our own failures.
// Log-only on purpose: nothing a student sends may change what other students are allowed to do.
const sessionEventLimiter = createRateLimiter({ maxEvents: 120, windowMs: 10 * 60 * 1_000 });
const EVENT_SURFACES = ["pdf", "quiz", "assignment"] as const;
const EVENT_NAMES = ["connect_failed", "closed", "retry_scheduled", "renewed", "renew_failed", "idle_closed", "response_timeout", "response_recovery"] as const;
const EVENT_KINDS = ["quota", "token_expired", "session_limit", "busy", "unavailable", "network", "unknown"] as const;

aiTutorRoutes.post("/session-events", async (context) => {
  const body = await readObject(context.req.raw);
  const userId = context.get("session").user.id;
  const event = parseSessionEvent(body);
  if (sessionEventLimiter.check(userId).allowed) {
    sessionEventLimiter.record(userId);
    const { event: name, ...details } = event;
    const failed = name === "connect_failed" || name === "closed" || name === "renew_failed" || name === "response_timeout";
    logEvent(failed ? "warn" : "info", "tutor_client_event", { userId, name, ...details });
  }
  return context.body(null, 204);
});

function parseSessionEvent(body: Record<string, unknown>) {
  const oneOf = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      throw new AiTutorRequestError(`${label} tidak valid.`);
    }
    return value as T;
  };
  const integer = (value: unknown, label: string, max: number) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
      throw new AiTutorRequestError(`${label} tidak valid.`);
    }
    return value;
  };
  const reason = body.reason;
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    throw new AiTutorRequestError("Alasan tidak valid.");
  }
  return {
    surface: oneOf(body.surface, EVENT_SURFACES, "Permukaan"),
    event: oneOf(body.event, EVENT_NAMES, "Event"),
    ...(body.kind === undefined || body.kind === null ? {} : { kind: oneOf(body.kind, EVENT_KINDS, "Jenis") }),
    ...(body.phase === undefined || body.phase === null ? {} : { phase: oneOf(body.phase, ["connect", "live"] as const, "Fase") }),
    code: integer(body.code, "Kode", 4999),
    ageMs: integer(body.ageMs, "Umur sesi", 3_600_000),
    attempt: integer(body.attempt, "Percobaan", 20),
    reason: typeof reason === "string" ? redact(reason).replace(/\s+/g, " ").slice(0, 200) : undefined,
  };
}

export class AiTutorRequestError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "AiTutorRequestError";
  }
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AiTutorRequestError("Body JSON tidak valid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiTutorRequestError("Body harus berupa object JSON.");
  }
  return value as Record<string, unknown>;
}

function requiredId(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AiTutorRequestError(`${label} tidak valid.`);
  }
  return value;
}

function optionalId(value: unknown, label: string) {
  return value === undefined || value === null ? undefined : requiredId(value, label);
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new AiTutorRequestError(`${label} wajib berupa teks.`);
  }
  return value;
}

function tutorMode(value: unknown): TutorMode {
  if (value !== "hint" && value !== "feedback") {
    throw new AiTutorRequestError("Mode tutor harus hint atau feedback.");
  }
  return value;
}

function classificationServerTiming(timing: {
  authorizationMs: number;
  classifierMs: number;
  persistenceMs: number;
  totalMs: number;
}) {
  const metric = (name: string, duration: number) =>
    `${name};dur=${Math.max(0, duration).toFixed(1)}`;
  return [
    metric("authorize", timing.authorizationMs),
    metric("classifier", timing.classifierMs),
    metric("persist", timing.persistenceMs),
    metric("classification", timing.totalMs),
  ].join(", ");
}

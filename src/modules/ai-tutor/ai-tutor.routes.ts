import { Hono } from "hono";

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

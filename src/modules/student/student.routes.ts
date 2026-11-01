import { Hono } from "hono";

import { fileResponse } from "../../lib/file-response";
import { getCourseIsland, getStudentProgress, getStudentWorld } from "../gamification/gamification.service";
import { requireSession, type StudentVariables } from "./student.auth";
import { workflowStages, type WorkflowStage, type WritingSignalInput } from "./student.repository";
import {
  completeStudentStage,
  deleteStudentQuizAnswer,
  getStudentAssignment,
  getStudentCourse,
  getStudentDashboard,
  getStudentLesson,
  getStudentQuiz,
  getStudentResourceFile,
  getStudentShell,
  listStudentCourses,
  regenerateQuizReflection,
  regenerateSubmissionOffloading,
  saveStudentQuizAnswers,
  setStudentLessonProgress,
  startStudentAssignment,
  startStudentQuiz,
  submitStudentQuiz,
  type QuizAnswerInput,
} from "./student.service";

export const studentRoutes = new Hono<{ Variables: StudentVariables }>();

studentRoutes.use("*", requireSession);

studentRoutes.get("/me", async (context) =>
  context.json(await getStudentShell(context.get("session"))),
);

studentRoutes.get("/dashboard", async (context) =>
  context.json(await getStudentDashboard(context.get("session"))),
);

studentRoutes.get("/courses", async (context) =>
  context.json(await listStudentCourses(context.get("session").user.id)),
);

studentRoutes.get("/courses/:courseId", async (context) =>
  context.json(
    await getStudentCourse(
      context.get("session").user.id,
      requiredId(context.req.param("courseId")),
    ),
  ),
);

studentRoutes.get("/courses/:courseId/island", async (context) =>
  context.json(
    await getCourseIsland(
      context.get("session").user.id,
      requiredId(context.req.param("courseId")),
    ),
  ),
);

studentRoutes.get("/points", async (context) =>
  context.json(await getStudentProgress(context.get("session").user.id)),
);

studentRoutes.get("/world", async (context) =>
  context.json(await getStudentWorld(context.get("session").user.id)),
);

studentRoutes.get("/lessons/:lessonId", async (context) =>
  context.json(
    await getStudentLesson(
      context.get("session").user.id,
      requiredId(context.req.param("lessonId")),
    ),
  ),
);

studentRoutes.get("/resources/:resourceId/file", async (context) =>
  fileResponse(
    context,
    await getStudentResourceFile(
      context.get("session").user.id,
      requiredId(context.req.param("resourceId")),
    ),
  ),
);

studentRoutes.patch("/lessons/:lessonId/progress", async (context) => {
  const body = await readObject(context.req.raw);
  const status = body.status;
  if (status !== "in_progress" && status !== "completed") {
    throw new RequestValidationError("Status progres tidak valid.");
  }
  return context.json(
    await setStudentLessonProgress(
      context.get("session").user.id,
      requiredId(context.req.param("lessonId")),
      status,
    ),
  );
});

studentRoutes.get("/assignments/:assignmentId", async (context) =>
  context.json(
    await getStudentAssignment(
      context.get("session").user.id,
      requiredId(context.req.param("assignmentId")),
    ),
  ),
);

studentRoutes.post("/assignments/:assignmentId/submissions", async (context) =>
  context.json(
    await startStudentAssignment(
      context.get("session").user.id,
      requiredId(context.req.param("assignmentId")),
    ),
    201,
  ),
);

studentRoutes.post(
  "/submissions/:submissionId/stages/:stage/complete",
  async (context) => {
    const body = await readObject(context.req.raw);
    const stage = context.req.param("stage") as WorkflowStage;
    if (!workflowStages.includes(stage)) {
      throw new RequestValidationError("Tahap assignment tidak valid.");
    }
    if (body.content !== undefined && typeof body.content !== "string") {
      throw new RequestValidationError("Isi jawaban harus berupa teks.");
    }
    return context.json(
      await completeStudentStage({
        userId: context.get("session").user.id,
        submissionId: requiredId(context.req.param("submissionId")),
        stage,
        content: body.content,
        signals: parseWritingSignals(body.signals),
      }),
    );
  },
);

studentRoutes.post(
  "/submissions/:submissionId/offloading",
  async (context) =>
    context.json(
      await regenerateSubmissionOffloading(
        context.get("session").user.id,
        requiredId(context.req.param("submissionId")),
      ),
    ),
);

studentRoutes.get("/quizzes/:quizId", async (context) =>
  context.json(
    await getStudentQuiz(
      context.get("session").user.id,
      requiredId(context.req.param("quizId")),
    ),
  ),
);

studentRoutes.post("/quizzes/:quizId/attempts", async (context) =>
  context.json(
    await startStudentQuiz(
      context.get("session").user.id,
      requiredId(context.req.param("quizId")),
    ),
    201,
  ),
);

studentRoutes.patch("/quiz-attempts/:attemptId/answers", async (context) => {
  const body = await readObject(context.req.raw);
  return context.json(
    await saveStudentQuizAnswers({
      userId: context.get("session").user.id,
      attemptId: requiredId(context.req.param("attemptId")),
      answers: parseAnswers(body.answers),
    }),
  );
});

studentRoutes.put(
  "/quiz-attempts/:attemptId/answers/:questionId",
  async (context) => {
    const body = await readObject(context.req.raw);
    const questionId = requiredId(context.req.param("questionId"));
    return context.json(
      await saveStudentQuizAnswers({
        userId: context.get("session").user.id,
        attemptId: requiredId(context.req.param("attemptId")),
        answers: parseAnswers([{ ...body, questionId }]),
      }),
    );
  },
);

studentRoutes.delete(
  "/quiz-attempts/:attemptId/answers/:questionId",
  async (context) =>
    context.json(
      await deleteStudentQuizAnswer({
        userId: context.get("session").user.id,
        attemptId: requiredId(context.req.param("attemptId")),
        questionId: requiredId(context.req.param("questionId")),
      }),
    ),
);

studentRoutes.post("/quiz-attempts/:attemptId/submit", async (context) => {
  const body = await readObject(context.req.raw);
  return context.json(
    await submitStudentQuiz({
      userId: context.get("session").user.id,
      attemptId: requiredId(context.req.param("attemptId")),
      answers: parseAnswers(body.answers),
    }),
  );
});

studentRoutes.post("/quiz-attempts/:attemptId/reflection", async (context) =>
  context.json(
    await regenerateQuizReflection(
      context.get("session").user.id,
      requiredId(context.req.param("attemptId")),
    ),
  ),
);

// The writing signal is supporting evidence, never a reason to refuse a stage:
// anything malformed is dropped rather than rejected.
const SIGNAL_LIMIT = 10_000_000;
function parseWritingSignals(value: unknown): WritingSignalInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const count = (key: string, max = SIGNAL_LIMIT) => {
    const number = raw[key];
    return typeof number === "number" && Number.isFinite(number)
      ? Math.min(max, Math.max(0, Math.round(number)))
      : 0;
  };
  const pastedChars = count("pastedChars");
  return {
    activeSeconds: count("activeSeconds", 7 * 24 * 60 * 60),
    typedChars: count("typedChars"),
    deletedChars: count("deletedChars"),
    pasteCount: count("pasteCount"),
    pastedChars,
    largestPaste: Math.min(count("largestPaste"), pastedChars),
    longPauses: count("longPauses"),
    focusLosses: count("focusLosses"),
    recorderVersion:
      typeof raw.recorderVersion === "string" && /^[a-z0-9.-]{1,32}$/.test(raw.recorderVersion)
        ? raw.recorderVersion
        : "unknown",
  };
}

export class RequestValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new RequestValidationError("Body JSON tidak valid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("Body harus berupa object JSON.");
  }
  return value as Record<string, unknown>;
}

function requiredId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RequestValidationError("ID tidak valid.");
  }
  return value;
}

function parseAnswers(value: unknown): QuizAnswerInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestValidationError("Jawaban quiz wajib diisi.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RequestValidationError("Format jawaban quiz tidak valid.");
    }
    const answer = item as Record<string, unknown>;
    if (typeof answer.questionId !== "string") {
      throw new RequestValidationError("ID soal wajib diisi.");
    }
    const questionId = requiredId(answer.questionId);
    const hasSelectedOption = answer.selectedOptionId !== undefined;
    const hasTextAnswer = answer.textAnswer !== undefined;
    if (hasSelectedOption === hasTextAnswer) {
      throw new RequestValidationError(
        "Jawaban harus berupa satu pilihan atau satu isian.",
      );
    }
    if (hasSelectedOption) {
      if (typeof answer.selectedOptionId !== "string") {
        throw new RequestValidationError("ID pilihan wajib diisi.");
      }
      return {
        questionId,
        selectedOptionId: requiredId(answer.selectedOptionId),
      };
    }
    if (typeof answer.textAnswer !== "string") {
      throw new RequestValidationError("Jawaban isian harus berupa teks.");
    }
    const textAnswer = answer.textAnswer.trim();
    if (!textAnswer || textAnswer.length > 500) {
      throw new RequestValidationError(
        "Jawaban isian wajib diisi dan maksimal 500 karakter.",
      );
    }
    return { questionId, textAnswer };
  });
}

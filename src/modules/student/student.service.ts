import type { AuthSession } from "../auth/auth";
import { normalizeShortAnswer, quizDefinitionsAreReady } from "../../lib/quiz-readiness";
import {
  generateQuizReflection,
  generateSubmissionOffloading,
  getQuizReflection,
  getSubmissionOffloading,
} from "../ai-analysis/ai-analysis.service";
import {
  createQuizAttempt,
  deleteQuizAnswer,
  createStudentSubmission,
  findQuizAttemptAccess,
  findStudentAssignment,
  findStudentCourse,
  findStudentLesson,
  findStudentResourceFile,
  findStudentProfile,
  findStudentQuiz,
  findSubmissionAccess,
  getCourseProgress,
  listCourseContent,
  listQuizQuestionDefinitions,
  listStudentCourseRows,
  persistStageCompletion,
  saveQuizAnswers,
  submitQuizAttempt,
  updateLessonProgress,
  workflowStages,
  type QuizAnswerInput as QuizAnswerValue,
  type WorkflowStage,
} from "./student.repository";

export type QuizAnswerInput = QuizAnswerValue;

export type StudentErrorCode =
  | "ASSIGNMENT_NOT_FOUND"
  | "ASSIGNMENT_ENROLLMENT_INACTIVE"
  | "ASSIGNMENT_NOT_AVAILABLE"
  | "ASSIGNMENT_SUBMISSION_NOT_FOUND"
  | "ASSIGNMENT_SUBMISSION_SUBMITTED"
  | "ASSIGNMENT_SUBMISSION_EXPIRED"
  | "ASSIGNMENT_STAGE_INVALID"
  | "ASSIGNMENT_STAGE_OUT_OF_ORDER"
  | "ASSIGNMENT_CONTENT_INVALID"
  | "ASSIGNMENT_SUBMIT_CONFLICT"
  | "QUIZ_NOT_FOUND"
  | "QUIZ_ENROLLMENT_INACTIVE"
  | "QUIZ_NOT_AVAILABLE"
  | "QUIZ_ALREADY_STARTED"
  | "QUIZ_EMPTY"
  | "QUIZ_NOT_READY"
  | "QUIZ_ATTEMPT_NOT_FOUND"
  | "QUIZ_ATTEMPT_SUBMITTED"
  | "QUIZ_ATTEMPT_EXPIRED"
  | "QUIZ_QUESTION_INVALID"
  | "QUIZ_ANSWER_INVALID"
  | "QUIZ_ANSWERS_INCOMPLETE"
  | "QUIZ_START_CONFLICT"
  | "QUIZ_SUBMIT_CONFLICT";

export class StudentServiceError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
    public readonly code?: StudentErrorCode,
  ) {
    super(message);
    this.name = "StudentServiceError";
  }
}

function isOpenForWork(item: {
  status: string;
  availableAt: Date | null;
  closesAt: Date | null;
}) {
  const now = Date.now();
  return (
    item.status === "published" &&
    (!item.availableAt || item.availableAt.getTime() <= now) &&
    (!item.closesAt || now < item.closesAt.getTime())
  );
}

function getQuizAvailability(item: {
  status: string;
  availableAt: Date | null;
  closesAt: Date | null;
}) {
  const now = Date.now();
  if (item.status !== "published") return "closed" as const;
  if (item.availableAt && now < item.availableAt.getTime()) return "upcoming" as const;
  if (item.closesAt && now >= item.closesAt.getTime()) return "closed" as const;
  return "available" as const;
}

function getAssignmentAvailability(item: {
  status: string;
  availableAt: Date | null;
  closesAt: Date | null;
  enrollmentStatus: string;
}) {
  const now = Date.now();
  if (item.enrollmentStatus !== "active") return "read_only" as const;
  if (item.status !== "published") return "closed" as const;
  if (item.availableAt && now < item.availableAt.getTime()) return "upcoming" as const;
  if (item.closesAt && now >= item.closesAt.getTime()) return "closed" as const;
  return "available" as const;
}

function getQuizActivityStatus(item: {
  status: string;
  availableAt?: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  attemptStatus: "in_progress" | "submitted" | null;
  attemptStartedAt: Date | null;
}) {
  if (item.attemptStatus === "submitted") return "submitted" as const;
  if (item.attemptStatus === "in_progress" && item.attemptStartedAt) {
    return getAttemptTiming({
      closesAt: item.closesAt,
      timeLimitMinutes: item.timeLimitMinutes,
      startedAt: item.attemptStartedAt,
    }).isExpired || item.status !== "published"
      ? ("expired" as const)
      : ("in_progress" as const);
  }
  return getQuizAvailability({
    status: item.status,
    availableAt: item.availableAt ?? null,
    closesAt: item.closesAt,
  }) === "available"
    ? ("not_started" as const)
    : ("closed" as const);
}

export async function getStudentShell(session: AuthSession) {
  const profile = await findStudentProfile(session.user.id);
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    profile,
  };
}

export async function listStudentCourses(userId: string) {
  const rows = await listStudentCourseRows(userId);
  const courses = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      progress: await getCourseProgress(row.id, row.enrollmentId),
    })),
  );

  return { courses };
}

export async function getStudentDashboard(session: AuthSession) {
  const profile = await findStudentProfile(session.user.id);
  const rows = await listStudentCourseRows(session.user.id);
  const courses = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      progress: await getCourseProgress(row.id, row.enrollmentId),
    })),
  );
  const content = await Promise.all(
    rows.map((row) => listCourseContent(row.id, row.enrollmentId)),
  );
  const upcoming = content
    .flatMap((item, index) => {
      const courseRow = rows[index];
      if (!courseRow || courseRow.status !== "published") return [];
      return [
      ...item.assignmentRows
        .filter((entry) => !entry.submissionStatus || entry.submissionStatus === "in_progress")
        .map((entry) => ({
          id: entry.id,
          type: "assignment" as const,
          title: entry.title,
          courseName: courseRow.name,
          dueAt: entry.dueAt,
          status: entry.submissionStatus ?? "not_started",
        })),
      ...item.quizRows
        .map((entry) => ({
          entry,
          effectiveStatus: getQuizActivityStatus(entry),
        }))
        .filter(
          ({ effectiveStatus }) =>
            effectiveStatus === "not_started" || effectiveStatus === "in_progress",
        )
        .map(({ entry, effectiveStatus }) => ({
          id: entry.id,
          type: "quiz" as const,
          title: entry.title,
          courseName: courseRow.name,
          dueAt: entry.dueAt,
          status: effectiveStatus,
        })),
    ];
    })
    .sort((left, right) => {
      if (!left.dueAt) return 1;
      if (!right.dueAt) return -1;
      return left.dueAt.getTime() - right.dueAt.getTime();
    })
    .slice(0, 6);

  const completedItems = courses.reduce(
    (total, item) => total + item.progress.completed,
    0,
  );
  const totalItems = courses.reduce((total, item) => total + item.progress.total, 0);

  return {
    user: { name: session.user.name },
    profile,
    courses,
    upcoming,
    summary: {
      activeCourses: courses.filter((item) => item.status === "published").length,
      completedItems,
      totalItems,
      progress: totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100),
    },
  };
}

export async function getStudentCourse(userId: string, courseId: string) {
  const courseRow = await findStudentCourse(courseId, userId);
  if (!courseRow) throw new StudentServiceError(404, "Course tidak ditemukan.");

  const [content, progress] = await Promise.all([
    listCourseContent(courseId, courseRow.enrollmentId),
    getCourseProgress(courseId, courseRow.enrollmentId),
  ]);
  const moduleMap = new Map<
    string,
    {
      id: string;
      title: string;
      description: string | null;
      position: number;
      lessons: Array<{
        id: string;
        title: string;
        position: number;
        status: "not_started" | "in_progress" | "completed";
      }>;
    }
  >();

  for (const row of content.lessonRows) {
    if (!moduleMap.has(row.moduleId)) {
      moduleMap.set(row.moduleId, {
        id: row.moduleId,
        title: row.moduleTitle,
        description: row.moduleDescription,
        position: row.modulePosition,
        lessons: [],
      });
    }
    if (row.lessonId && row.lessonTitle && row.lessonPosition) {
      moduleMap.get(row.moduleId)?.lessons.push({
        id: row.lessonId,
        title: row.lessonTitle,
        position: row.lessonPosition,
        status: row.progressStatus ?? "not_started",
      });
    }
  }

  return {
    course: courseRow,
    teachers: content.teachers.map((teacher) => teacher.name),
    progress,
    modules: Array.from(moduleMap.values()),
    assignments: content.assignmentRows,
    quizzes: content.quizRows.map((quizRow) => ({
      ...quizRow,
      attemptStatus:
        courseRow.status === "published"
          ? getQuizActivityStatus(quizRow)
          : "archived",
    })),
    announcements: content.announcements,
  };
}

export async function getStudentLesson(userId: string, lessonId: string) {
  const lessonRow = await findStudentLesson(lessonId, userId);
  if (!lessonRow) throw new StudentServiceError(404, "Materi tidak ditemukan.");
  return lessonRow;
}

export async function getStudentResourceFile(userId: string, resourceId: string) {
  const file = await findStudentResourceFile(resourceId, userId);
  if (!file) throw new StudentServiceError(404, "File tidak ditemukan.");
  return file;
}

export async function setStudentLessonProgress(
  userId: string,
  lessonId: string,
  status: "in_progress" | "completed",
) {
  const lessonRow = await getStudentLesson(userId, lessonId);
  if (lessonRow.enrollmentStatus !== "active") {
    throw new StudentServiceError(409, "Course arsip hanya dapat dilihat.");
  }
  return updateLessonProgress(lessonId, lessonRow.enrollmentId, status);
}

export async function getStudentAssignment(userId: string, assignmentId: string) {
  const row = await findStudentAssignment(assignmentId, userId);
  if (!row) {
    throw new StudentServiceError(
      404,
      "Assignment tidak ditemukan.",
      "ASSIGNMENT_NOT_FOUND",
    );
  }
  const availability = getAssignmentAvailability(row);
  const finished =
    row.submission?.status === "submitted" ||
    row.submission?.status === "returned";
  const offloading =
    finished && row.submission
      ? await getSubmissionOffloading(row.submission.id)
      : null;
  return {
    ...row,
    submission: row.submission ? { ...row.submission, offloading } : null,
    availability,
    canStart: !row.submission && availability === "available",
    canContinue:
      row.submission?.status === "in_progress" && availability === "available",
  };
}

export async function regenerateSubmissionOffloading(
  userId: string,
  submissionId: string,
) {
  const access = await findSubmissionAccess(submissionId, userId);
  if (!access) {
    throw new StudentServiceError(
      404,
      "Submission tidak ditemukan.",
      "ASSIGNMENT_SUBMISSION_NOT_FOUND",
    );
  }
  if (access.status !== "submitted" && access.status !== "returned") {
    throw new StudentServiceError(
      409,
      "Laporan refleksi hanya tersedia setelah assignment dikumpulkan.",
    );
  }
  const offloading = await generateSubmissionOffloading(submissionId);
  return { generated: Boolean(offloading), offloading };
}

export async function startStudentAssignment(userId: string, assignmentId: string) {
  const row = await getStudentAssignment(userId, assignmentId);
  if (row.enrollmentStatus !== "active") {
    throw new StudentServiceError(
      409,
      "Enrollment course tidak lagi aktif.",
      "ASSIGNMENT_ENROLLMENT_INACTIVE",
    );
  }
  if (!isOpenForWork(row)) {
    throw new StudentServiceError(
      409,
      "Assignment belum tersedia atau sudah ditutup.",
      "ASSIGNMENT_NOT_AVAILABLE",
    );
  }
  if (row.submission?.status === "submitted" || row.submission?.status === "returned") {
    return row.submission;
  }
  return createStudentSubmission(assignmentId, row.enrollmentId);
}

export async function completeStudentStage(input: {
  userId: string;
  submissionId: string;
  stage: WorkflowStage;
  content?: string;
}) {
  const access = await findSubmissionAccess(input.submissionId, input.userId);
  if (!access) {
    throw new StudentServiceError(
      404,
      "Submission tidak ditemukan.",
      "ASSIGNMENT_SUBMISSION_NOT_FOUND",
    );
  }
  if (access.status !== "in_progress") {
    if (access.status === "submitted" && input.stage === "5_reflection") {
      return { currentStage: null, submitted: true, alreadyCompleted: true };
    }
    throw new StudentServiceError(
      409,
      "Submission ini sudah selesai.",
      "ASSIGNMENT_SUBMISSION_SUBMITTED",
    );
  }
  if (access.assignmentStatus !== "published") {
    throw new StudentServiceError(
      409,
      "Assignment sudah ditutup.",
      "ASSIGNMENT_NOT_AVAILABLE",
    );
  }
  if (access.closesAt && access.closesAt.getTime() <= Date.now()) {
    throw new StudentServiceError(
      409,
      "Batas waktu pengerjaan assignment telah berakhir.",
      "ASSIGNMENT_SUBMISSION_EXPIRED",
    );
  }
  if (access.currentStage !== input.stage) {
    throw new StudentServiceError(
      409,
      "Tahap harus diselesaikan secara berurutan.",
      "ASSIGNMENT_STAGE_OUT_OF_ORDER",
    );
  }

  const stageIndex = workflowStages.indexOf(input.stage);
  if (stageIndex < 0) {
    throw new StudentServiceError(
      400,
      "Tahap tidak valid.",
      "ASSIGNMENT_STAGE_INVALID",
    );
  }
  const requiresArtifact = input.stage !== "2_guided_questioning";
  const content = input.content?.trim();
  if (requiresArtifact && (!content || content.length < 10)) {
    throw new StudentServiceError(
      400,
      "Jawaban tahap minimal 10 karakter.",
      "ASSIGNMENT_CONTENT_INVALID",
    );
  }

  const nextStage = workflowStages[stageIndex + 1] ?? null;
  const completion = await persistStageCompletion({
    submissionId: input.submissionId,
    stage: input.stage,
    nextStage,
    content: requiresArtifact ? content : undefined,
  });
  if (!completion.applied) {
    const currentIndex = completion.currentStage
      ? workflowStages.indexOf(completion.currentStage)
      : -1;
    if (
      completion.status === "submitted" &&
      input.stage === "5_reflection"
    ) {
      return { currentStage: null, submitted: true, alreadyCompleted: true };
    }
    if (currentIndex > stageIndex) {
      return {
        currentStage: completion.currentStage,
        submitted: false,
        alreadyCompleted: true,
      };
    }
    throw new StudentServiceError(
      409,
      "Tahap berubah saat jawaban diproses. Muat ulang assignment lalu coba lagi.",
      "ASSIGNMENT_SUBMIT_CONFLICT",
    );
  }
  // Final stage submitted: produce the reflective AI Offloading report. This is
  // best-effort and never throws, so a failed analysis cannot block submission.
  if (nextStage === null) {
    await generateSubmissionOffloading(input.submissionId);
  }
  return { currentStage: nextStage, submitted: nextStage === null };
}

export async function getStudentQuiz(userId: string, quizId: string) {
  const row = await findStudentQuiz(quizId, userId);
  if (!row) {
    throw new StudentServiceError(404, "Quiz tidak ditemukan.", "QUIZ_NOT_FOUND");
  }
  const questionMap = new Map<
    string,
    {
      id: string;
      type: "multiple_choice" | "short_answer";
      prompt: string;
      explanation?: string | null;
      correctAnswer?: string;
      points: string;
      position: number;
      options: Array<{ id: string; label: string; position: number; isCorrect?: boolean }>;
    }
  >();
  const submitted = row.attempt?.status === "submitted";
  const attemptTiming =
    row.attempt?.status === "in_progress"
      ? getAttemptTiming({
          closesAt: row.closesAt,
          timeLimitMinutes: row.timeLimitMinutes,
          startedAt: row.attempt.startedAt,
        })
      : null;
  const baseAvailability =
    row.enrollmentStatus === "active" && row.courseStatus === "published"
      ? getQuizAvailability(row)
      : "read_only";
  for (const questionRow of row.questionRows) {
    if (!questionMap.has(questionRow.questionId)) {
      questionMap.set(questionRow.questionId, {
        id: questionRow.questionId,
        type: questionRow.questionType,
        prompt: questionRow.prompt,
        explanation: submitted ? questionRow.explanation : undefined,
        ...(submitted && questionRow.questionType === "short_answer"
          ? { correctAnswer: questionRow.acceptedAnswers?.[0] }
          : {}),
        points: questionRow.points,
        position: questionRow.questionPosition,
        options: [],
      });
    }
    if (
      questionRow.optionId &&
      questionRow.optionLabel !== null &&
      questionRow.optionPosition !== null
    ) {
      questionMap.get(questionRow.questionId)?.options.push({
        id: questionRow.optionId,
        label: questionRow.optionLabel,
        position: questionRow.optionPosition,
        ...(submitted ? { isCorrect: questionRow.optionIsCorrect ?? false } : {}),
      });
    }
  }

  const quizReady = quizDefinitionsAreReady(
    row.questionRows.map((questionRow) => ({
      questionId: questionRow.questionId,
      questionType: questionRow.questionType,
      acceptedAnswers: questionRow.acceptedAnswers,
      points: questionRow.points,
      optionId: questionRow.optionId,
      isCorrect: questionRow.optionIsCorrect,
    })),
  );
  const availability =
    baseAvailability === "available" && !quizReady
      ? "not_ready"
      : baseAvailability;

  const reflection =
    submitted && row.attempt ? await getQuizReflection(row.attempt.id) : null;

  return {
    quiz: {
      id: row.id,
      title: row.title,
      instructions: row.instructions,
      status: row.status,
      availableAt: row.availableAt,
      dueAt: row.dueAt,
      closesAt: row.closesAt,
      timeLimitMinutes: row.timeLimitMinutes,
      courseId: row.courseId,
      courseName: row.courseName,
    },
    questions: Array.from(questionMap.values()),
    attempt: row.attempt
      ? {
          ...row.attempt,
          expiresAt: attemptTiming?.expiresAt?.toISOString() ?? null,
          isExpired: attemptTiming?.isExpired ?? false,
          remainingSeconds: attemptTiming?.remainingSeconds ?? null,
          canContinue:
            row.enrollmentStatus === "active" &&
            row.courseStatus === "published" &&
            row.status === "published" &&
            quizReady &&
            !(attemptTiming?.isExpired ?? false),
          reflection,
        }
      : null,
    availability,
    canStart:
      row.enrollmentStatus === "active" &&
      row.courseStatus === "published" &&
      isOpenForWork(row) &&
      quizReady &&
      !row.attempt,
  };
}

export async function startStudentQuiz(userId: string, quizId: string) {
  const row = await findStudentQuiz(quizId, userId);
  if (!row) {
    throw new StudentServiceError(404, "Quiz tidak ditemukan.", "QUIZ_NOT_FOUND");
  }
  if (row.enrollmentStatus !== "active") {
    throw new StudentServiceError(
      409,
      "Enrollment course tidak lagi aktif.",
      "QUIZ_ENROLLMENT_INACTIVE",
    );
  }
  if (row.courseStatus !== "published") {
    throw new StudentServiceError(
      409,
      "Course tidak lagi menerima aktivitas baru.",
      "QUIZ_NOT_AVAILABLE",
    );
  }
  if (row.attempt) {
    if (row.attempt.status === "submitted") {
      throw new StudentServiceError(
        409,
        "Quiz ini sudah dikumpulkan.",
        "QUIZ_ATTEMPT_SUBMITTED",
      );
    }
    const timing = getAttemptTiming({
      closesAt: row.closesAt,
      timeLimitMinutes: row.timeLimitMinutes,
      startedAt: row.attempt.startedAt,
    });
    if (timing.isExpired) {
      throw new StudentServiceError(
        409,
        "Waktu pengerjaan quiz telah berakhir.",
        "QUIZ_ATTEMPT_EXPIRED",
      );
    }
    throw new StudentServiceError(
      409,
      "Quiz sudah dimulai. Lanjutkan attempt yang sedang berjalan.",
      "QUIZ_ALREADY_STARTED",
    );
  }
  if (!isOpenForWork(row)) {
    throw new StudentServiceError(
      409,
      "Quiz belum tersedia atau sudah ditutup.",
      "QUIZ_NOT_AVAILABLE",
    );
  }
  const definitions = await listQuizQuestionDefinitions(quizId);
  const questions = groupQuizQuestionDefinitions(definitions);
  if (questions.size === 0) {
    throw new StudentServiceError(409, "Quiz belum memiliki soal.", "QUIZ_EMPTY");
  }
  if (!quizDefinitionsAreReady(definitions)) {
    throw new StudentServiceError(
      409,
      "Quiz memiliki soal yang belum siap dipublikasikan.",
      "QUIZ_NOT_READY",
    );
  }
  const result = await createQuizAttempt(quizId, row.enrollmentId);
  if (!result) {
    throw new StudentServiceError(
      409,
      "Quiz gagal dimulai. Muat ulang halaman lalu coba lagi.",
      "QUIZ_START_CONFLICT",
    );
  }
  if (!result.created) {
    throw new StudentServiceError(
      409,
      result.attempt.status === "submitted"
        ? "Quiz ini sudah dikumpulkan."
        : "Quiz sudah dimulai. Lanjutkan attempt yang sedang berjalan.",
      result.attempt.status === "submitted"
        ? "QUIZ_ATTEMPT_SUBMITTED"
        : "QUIZ_ALREADY_STARTED",
    );
  }
  return result.attempt;
}

function getAttemptTiming(attempt: {
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  startedAt: Date;
}) {
  const now = Date.now();
  const deadlines: number[] = [];
  if (attempt.closesAt) deadlines.push(attempt.closesAt.getTime());
  if (attempt.timeLimitMinutes) {
    deadlines.push(
      attempt.startedAt.getTime() + attempt.timeLimitMinutes * 60_000,
    );
  }
  const expiresAtMs = deadlines.length > 0 ? Math.min(...deadlines) : null;
  return {
    expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs),
    isExpired: expiresAtMs !== null && now >= expiresAtMs,
    remainingSeconds:
      expiresAtMs === null ? null : Math.max(0, Math.ceil((expiresAtMs - now) / 1_000)),
  };
}

function ensureAttemptTimeRemaining(attempt: {
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  startedAt: Date;
}) {
  if (getAttemptTiming(attempt).isExpired) {
    throw new StudentServiceError(
      409,
      "Waktu pengerjaan quiz telah berakhir.",
      "QUIZ_ATTEMPT_EXPIRED",
    );
  }
}

type QuizQuestionDefinition = Awaited<
  ReturnType<typeof listQuizQuestionDefinitions>
>[number];

function groupQuizQuestionDefinitions(rows: QuizQuestionDefinition[]) {
  const questions = new Map<string, QuizQuestionDefinition[]>();
  for (const row of rows) {
    const questionRows = questions.get(row.questionId) ?? [];
    questionRows.push(row);
    questions.set(row.questionId, questionRows);
  }
  return questions;
}

function validateAnswers(
  definitionRows: QuizQuestionDefinition[],
  answers: QuizAnswerInput[],
) {
  const questions = groupQuizQuestionDefinitions(definitionRows);
  const seen = new Set<string>();
  const validated: QuizAnswerInput[] = [];
  for (const answer of answers) {
    if (seen.has(answer.questionId)) {
      throw new StudentServiceError(
        400,
        "Satu soal hanya boleh memiliki satu jawaban.",
        "QUIZ_ANSWER_INVALID",
      );
    }
    const rows = questions.get(answer.questionId);
    const question = rows?.[0];
    if (!rows || !question) {
      throw new StudentServiceError(400, "Soal quiz tidak valid.", "QUIZ_QUESTION_INVALID");
    }

    if (question.questionType === "multiple_choice") {
      if (
        typeof answer.selectedOptionId !== "string" ||
        answer.textAnswer !== undefined ||
        !rows.some((row) => row.optionId === answer.selectedOptionId)
      ) {
        throw new StudentServiceError(
          400,
          "Pilihan jawaban tidak valid.",
          "QUIZ_ANSWER_INVALID",
        );
      }
      validated.push({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
      });
    } else {
      const textAnswer = answer.textAnswer?.trim();
      if (
        answer.selectedOptionId !== undefined ||
        !textAnswer ||
        textAnswer.length > 500
      ) {
        throw new StudentServiceError(
          400,
          "Jawaban isian tidak valid.",
          "QUIZ_ANSWER_INVALID",
        );
      }
      validated.push({ questionId: answer.questionId, textAnswer });
    }
    seen.add(answer.questionId);
  }
  return validated;
}

function gradeAnswers(
  definitionRows: QuizQuestionDefinition[],
  answers: QuizAnswerInput[],
) {
  const questions = groupQuizQuestionDefinitions(definitionRows);
  return answers.map((answer) => {
    const rows = questions.get(answer.questionId);
    const question = rows?.[0];
    if (!rows || !question) {
      throw new StudentServiceError(400, "Soal quiz tidak valid.", "QUIZ_QUESTION_INVALID");
    }
    const isCorrect =
      question.questionType === "multiple_choice"
        ? rows.some(
            (row) =>
              row.optionId === answer.selectedOptionId && row.isCorrect === true,
          )
        : (question.acceptedAnswers ?? []).some(
            (acceptedAnswer) =>
              normalizeShortAnswer(acceptedAnswer) ===
              normalizeShortAnswer(answer.textAnswer ?? ""),
          );

    return {
      ...answer,
      isCorrect,
      awardedPoints: isCorrect ? Number(question.points).toFixed(2) : "0.00",
    };
  });
}

export async function saveStudentQuizAnswers(input: {
  userId: string;
  attemptId: string;
  answers: QuizAnswerInput[];
}) {
  const attempt = await findQuizAttemptAccess(input.attemptId, input.userId);
  if (!attempt) {
    throw new StudentServiceError(
      404,
      "Attempt quiz tidak ditemukan.",
      "QUIZ_ATTEMPT_NOT_FOUND",
    );
  }
  if (attempt.enrollmentStatus !== "active") {
    throw new StudentServiceError(
      409,
      "Enrollment course tidak lagi aktif.",
      "QUIZ_ENROLLMENT_INACTIVE",
    );
  }
  if (attempt.courseStatus !== "published" || attempt.quizStatus !== "published") {
    throw new StudentServiceError(
      409,
      "Quiz tidak lagi menerima jawaban.",
      "QUIZ_NOT_AVAILABLE",
    );
  }
  if (attempt.status !== "in_progress") {
    throw new StudentServiceError(
      409,
      "Quiz ini sudah dikumpulkan.",
      "QUIZ_ATTEMPT_SUBMITTED",
    );
  }
  ensureAttemptTimeRemaining(attempt);
  const definitions = await listQuizQuestionDefinitions(attempt.quizId);
  if (!quizDefinitionsAreReady(definitions)) {
    throw new StudentServiceError(
      409,
      "Quiz tidak dapat dinilai karena konfigurasi soal tidak lagi valid.",
      "QUIZ_NOT_READY",
    );
  }
  const answers = validateAnswers(definitions, input.answers);
  const saved = await saveQuizAnswers(input.attemptId, answers);
  if (!saved) {
    throw new StudentServiceError(
      409,
      "Quiz ini sudah dikumpulkan.",
      "QUIZ_ATTEMPT_SUBMITTED",
    );
  }
  return { saved: true, savedAt: new Date().toISOString() };
}

export async function deleteStudentQuizAnswer(input: {
  userId: string;
  attemptId: string;
  questionId: string;
}) {
  const attempt = await findQuizAttemptAccess(input.attemptId, input.userId);
  if (!attempt) {
    throw new StudentServiceError(
      404,
      "Attempt quiz tidak ditemukan.",
      "QUIZ_ATTEMPT_NOT_FOUND",
    );
  }
  if (attempt.enrollmentStatus !== "active") {
    throw new StudentServiceError(
      409,
      "Enrollment course tidak lagi aktif.",
      "QUIZ_ENROLLMENT_INACTIVE",
    );
  }
  if (attempt.courseStatus !== "published" || attempt.quizStatus !== "published") {
    throw new StudentServiceError(
      409,
      "Quiz tidak lagi menerima jawaban.",
      "QUIZ_NOT_AVAILABLE",
    );
  }
  if (attempt.status !== "in_progress") {
    throw new StudentServiceError(
      409,
      "Quiz ini sudah dikumpulkan.",
      "QUIZ_ATTEMPT_SUBMITTED",
    );
  }
  ensureAttemptTimeRemaining(attempt);

  const definitions = await listQuizQuestionDefinitions(attempt.quizId);
  if (!quizDefinitionsAreReady(definitions)) {
    throw new StudentServiceError(
      409,
      "Quiz tidak dapat diubah karena konfigurasi soal tidak lagi valid.",
      "QUIZ_NOT_READY",
    );
  }
  if (!definitions.some((definition) => definition.questionId === input.questionId)) {
    throw new StudentServiceError(400, "Soal quiz tidak valid.", "QUIZ_QUESTION_INVALID");
  }

  const deleted = await deleteQuizAnswer(input.attemptId, input.questionId);
  if (!deleted) {
    throw new StudentServiceError(
      409,
      "Quiz ini sudah dikumpulkan.",
      "QUIZ_ATTEMPT_SUBMITTED",
    );
  }
  return { deleted: true, savedAt: new Date().toISOString() };
}

export async function submitStudentQuiz(input: {
  userId: string;
  attemptId: string;
  answers: QuizAnswerInput[];
}) {
  const attempt = await findQuizAttemptAccess(input.attemptId, input.userId);
  if (!attempt) {
    throw new StudentServiceError(
      404,
      "Attempt quiz tidak ditemukan.",
      "QUIZ_ATTEMPT_NOT_FOUND",
    );
  }
  if (attempt.enrollmentStatus !== "active") {
    throw new StudentServiceError(
      409,
      "Enrollment course tidak lagi aktif.",
      "QUIZ_ENROLLMENT_INACTIVE",
    );
  }
  if (attempt.courseStatus !== "published" || attempt.quizStatus !== "published") {
    throw new StudentServiceError(
      409,
      "Quiz tidak lagi menerima jawaban.",
      "QUIZ_NOT_AVAILABLE",
    );
  }
  if (attempt.status !== "in_progress") {
    throw new StudentServiceError(
      409,
      "Quiz ini sudah dikumpulkan.",
      "QUIZ_ATTEMPT_SUBMITTED",
    );
  }
  ensureAttemptTimeRemaining(attempt);

  const definitions = await listQuizQuestionDefinitions(attempt.quizId);
  if (!quizDefinitionsAreReady(definitions)) {
    throw new StudentServiceError(
      409,
      "Quiz tidak dapat dinilai karena konfigurasi soal tidak lagi valid.",
      "QUIZ_NOT_READY",
    );
  }
  const answers = validateAnswers(definitions, input.answers);
  const questions = groupQuizQuestionDefinitions(definitions);
  if (answers.length !== questions.size) {
    throw new StudentServiceError(
      400,
      "Semua soal harus dijawab sebelum dikumpulkan.",
      "QUIZ_ANSWERS_INCOMPLETE",
    );
  }
  const gradedAnswers = gradeAnswers(definitions, answers);
  const totalPoints = Array.from(questions.values()).reduce(
    (total, rows) => total + Number(rows[0]?.points ?? 0),
    0,
  );
  const awardedPoints = gradedAnswers.reduce(
    (total, answer) => total + Number(answer.awardedPoints),
    0,
  );
  const score =
    totalPoints === 0
      ? 0
      : Math.round((awardedPoints / totalPoints) * 10_000) / 100;
  const result = await submitQuizAttempt(
    input.attemptId,
    gradedAnswers,
    score.toFixed(2),
  );
  if (!result) {
    throw new StudentServiceError(
      409,
      "Quiz gagal dikumpulkan karena status attempt telah berubah.",
      "QUIZ_SUBMIT_CONFLICT",
    );
  }
  // Best-effort AI-usage reflection (separate from the academic score, PRD §5.3A).
  await generateQuizReflection(input.attemptId);
  return result;
}

export async function regenerateQuizReflection(
  userId: string,
  attemptId: string,
) {
  const attempt = await findQuizAttemptAccess(attemptId, userId);
  if (!attempt) {
    throw new StudentServiceError(
      404,
      "Attempt quiz tidak ditemukan.",
      "QUIZ_ATTEMPT_NOT_FOUND",
    );
  }
  if (attempt.status !== "submitted") {
    throw new StudentServiceError(
      409,
      "Refleksi hanya tersedia setelah quiz dikumpulkan.",
    );
  }
  const reflection = await generateQuizReflection(attemptId);
  return { generated: Boolean(reflection), reflection };
}

import type { AuthSession } from "../auth/auth";
import {
  createQuizAttempt,
  deleteQuizAnswer,
  createStudentSubmission,
  findQuizAttemptAccess,
  findStudentAssignment,
  findStudentContext,
  findStudentCourse,
  findStudentLesson,
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

export class StudentServiceError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "StudentServiceError";
  }
}

async function requireStudentContext(userId: string) {
  const context = await findStudentContext(userId);
  if (!context) {
    throw new StudentServiceError(
      403,
      "Akun belum memiliki keanggotaan siswa aktif di sekolah.",
    );
  }
  return context;
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
    (!item.closesAt || item.closesAt.getTime() >= now)
  );
}

export async function getStudentShell(session: AuthSession) {
  const context = await findStudentContext(session.user.id);
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    school: context
      ? {
          id: context.schoolId,
          name: context.schoolName,
          gradeLevel: context.gradeLevel,
        }
      : null,
  };
}

export async function listStudentCourses(userId: string) {
  const context = await findStudentContext(userId);
  if (!context) return { school: null, courses: [] };
  const rows = await listStudentCourseRows(context.membershipId);
  const courses = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      progress: await getCourseProgress(row.id, row.enrollmentId),
    })),
  );

  return { school: { id: context.schoolId, name: context.schoolName }, courses };
}

export async function getStudentDashboard(session: AuthSession) {
  const context = await findStudentContext(session.user.id);
  if (!context) {
    return {
      user: { name: session.user.name },
      school: null,
      courses: [],
      upcoming: [],
      summary: { activeCourses: 0, completedItems: 0, totalItems: 0, progress: 0 },
    };
  }

  const rows = await listStudentCourseRows(context.membershipId);
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
      if (!courseRow) return [];
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
        .filter((entry) => entry.attemptStatus !== "submitted")
        .map((entry) => ({
          id: entry.id,
          type: "quiz" as const,
          title: entry.title,
          courseName: courseRow.name,
          dueAt: entry.dueAt,
          status: entry.attemptStatus ?? "not_started",
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
    school: {
      id: context.schoolId,
      name: context.schoolName,
      gradeLevel: context.gradeLevel,
    },
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
  const context = await requireStudentContext(userId);
  const courseRow = await findStudentCourse(courseId, context.membershipId);
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
    quizzes: content.quizRows,
    announcements: content.announcements,
  };
}

export async function getStudentLesson(userId: string, lessonId: string) {
  const context = await requireStudentContext(userId);
  const lessonRow = await findStudentLesson(lessonId, context.membershipId);
  if (!lessonRow) throw new StudentServiceError(404, "Materi tidak ditemukan.");
  return lessonRow;
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
  const context = await requireStudentContext(userId);
  const row = await findStudentAssignment(assignmentId, context.membershipId);
  if (!row) throw new StudentServiceError(404, "Assignment tidak ditemukan.");
  return row;
}

export async function startStudentAssignment(userId: string, assignmentId: string) {
  const row = await getStudentAssignment(userId, assignmentId);
  if (row.enrollmentStatus !== "active") {
    throw new StudentServiceError(409, "Enrollment course tidak lagi aktif.");
  }
  if (!isOpenForWork(row)) {
    throw new StudentServiceError(409, "Assignment belum tersedia atau sudah ditutup.");
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
  const context = await requireStudentContext(input.userId);
  const access = await findSubmissionAccess(input.submissionId, context.membershipId);
  if (!access) throw new StudentServiceError(404, "Submission tidak ditemukan.");
  if (access.status !== "in_progress") {
    throw new StudentServiceError(409, "Submission ini sudah selesai.");
  }
  if (access.assignmentStatus !== "published") {
    throw new StudentServiceError(409, "Assignment sudah ditutup.");
  }
  if (access.closesAt && access.closesAt.getTime() < Date.now()) {
    throw new StudentServiceError(409, "Batas waktu pengerjaan assignment telah berakhir.");
  }
  if (access.currentStage !== input.stage) {
    throw new StudentServiceError(409, "Tahap harus diselesaikan secara berurutan.");
  }

  const stageIndex = workflowStages.indexOf(input.stage);
  if (stageIndex < 0) throw new StudentServiceError(400, "Tahap tidak valid.");
  const requiresArtifact = input.stage !== "2_guided_questioning";
  const content = input.content?.trim();
  if (requiresArtifact && (!content || content.length < 10)) {
    throw new StudentServiceError(400, "Jawaban tahap minimal 10 karakter.");
  }

  const nextStage = workflowStages[stageIndex + 1] ?? null;
  await persistStageCompletion({
    submissionId: input.submissionId,
    stage: input.stage,
    nextStage,
    content: requiresArtifact ? content : undefined,
  });
  return { currentStage: nextStage, submitted: nextStage === null };
}

export async function getStudentQuiz(userId: string, quizId: string) {
  const context = await requireStudentContext(userId);
  const row = await findStudentQuiz(quizId, context.membershipId);
  if (!row) throw new StudentServiceError(404, "Quiz tidak ditemukan.");
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
    attempt: row.attempt,
    canStart: row.enrollmentStatus === "active" && isOpenForWork(row) && !row.attempt,
  };
}

export async function startStudentQuiz(userId: string, quizId: string) {
  const context = await requireStudentContext(userId);
  const row = await findStudentQuiz(quizId, context.membershipId);
  if (!row) throw new StudentServiceError(404, "Quiz tidak ditemukan.");
  if (row.enrollmentStatus !== "active") {
    throw new StudentServiceError(409, "Enrollment course tidak lagi aktif.");
  }
  if (!isOpenForWork(row)) {
    throw new StudentServiceError(409, "Quiz belum tersedia atau sudah ditutup.");
  }
  const definitions = await listQuizQuestionDefinitions(quizId);
  const questions = groupQuizQuestionDefinitions(definitions);
  if (questions.size === 0) {
    throw new StudentServiceError(409, "Quiz belum memiliki soal.");
  }
  for (const rows of questions.values()) {
    const question = rows[0];
    if (!question) continue;
    const isReady =
      question.questionType === "multiple_choice"
        ? rows.filter((row) => row.optionId).length >= 2 &&
          rows.filter((row) => row.isCorrect).length === 1
        : (question.acceptedAnswers?.length ?? 0) > 0;
    if (!isReady) {
      throw new StudentServiceError(409, "Quiz memiliki soal yang belum siap dipublikasikan.");
    }
  }
  return createQuizAttempt(quizId, row.enrollmentId);
}

function ensureAttemptTimeRemaining(attempt: {
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  startedAt: Date;
}) {
  const now = Date.now();
  if (attempt.closesAt && attempt.closesAt.getTime() < now) {
    throw new StudentServiceError(409, "Batas waktu quiz telah berakhir.");
  }
  if (
    attempt.timeLimitMinutes &&
    attempt.startedAt.getTime() + attempt.timeLimitMinutes * 60_000 < now
  ) {
    throw new StudentServiceError(409, "Durasi pengerjaan quiz telah berakhir.");
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
      throw new StudentServiceError(400, "Satu soal hanya boleh memiliki satu jawaban.");
    }
    const rows = questions.get(answer.questionId);
    const question = rows?.[0];
    if (!rows || !question) {
      throw new StudentServiceError(400, "Soal quiz tidak valid.");
    }

    if (question.questionType === "multiple_choice") {
      if (
        typeof answer.selectedOptionId !== "string" ||
        answer.textAnswer !== undefined ||
        !rows.some((row) => row.optionId === answer.selectedOptionId)
      ) {
        throw new StudentServiceError(400, "Pilihan jawaban tidak valid.");
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
        throw new StudentServiceError(400, "Jawaban isian tidak valid.");
      }
      validated.push({ questionId: answer.questionId, textAnswer });
    }
    seen.add(answer.questionId);
  }
  return validated;
}

function normalizeShortAnswer(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("id-ID");
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
      throw new StudentServiceError(400, "Soal quiz tidak valid.");
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
  const context = await requireStudentContext(input.userId);
  const attempt = await findQuizAttemptAccess(input.attemptId, context.membershipId);
  if (!attempt) throw new StudentServiceError(404, "Attempt quiz tidak ditemukan.");
  if (attempt.status !== "in_progress") {
    throw new StudentServiceError(409, "Quiz ini sudah dikumpulkan.");
  }
  ensureAttemptTimeRemaining(attempt);
  const definitions = await listQuizQuestionDefinitions(attempt.quizId);
  const answers = validateAnswers(definitions, input.answers);
  const saved = await saveQuizAnswers(input.attemptId, answers);
  if (!saved) throw new StudentServiceError(409, "Quiz ini sudah dikumpulkan.");
  return { saved: true, savedAt: new Date().toISOString() };
}

export async function deleteStudentQuizAnswer(input: {
  userId: string;
  attemptId: string;
  questionId: string;
}) {
  const context = await requireStudentContext(input.userId);
  const attempt = await findQuizAttemptAccess(input.attemptId, context.membershipId);
  if (!attempt) throw new StudentServiceError(404, "Attempt quiz tidak ditemukan.");
  if (attempt.status !== "in_progress") {
    throw new StudentServiceError(409, "Quiz ini sudah dikumpulkan.");
  }
  ensureAttemptTimeRemaining(attempt);

  const definitions = await listQuizQuestionDefinitions(attempt.quizId);
  if (!definitions.some((definition) => definition.questionId === input.questionId)) {
    throw new StudentServiceError(400, "Soal quiz tidak valid.");
  }

  const deleted = await deleteQuizAnswer(input.attemptId, input.questionId);
  if (!deleted) throw new StudentServiceError(409, "Quiz ini sudah dikumpulkan.");
  return { deleted: true, savedAt: new Date().toISOString() };
}

export async function submitStudentQuiz(input: {
  userId: string;
  attemptId: string;
  answers: QuizAnswerInput[];
}) {
  const context = await requireStudentContext(input.userId);
  const attempt = await findQuizAttemptAccess(input.attemptId, context.membershipId);
  if (!attempt) throw new StudentServiceError(404, "Attempt quiz tidak ditemukan.");
  if (attempt.status !== "in_progress") {
    throw new StudentServiceError(409, "Quiz ini sudah dikumpulkan.");
  }
  ensureAttemptTimeRemaining(attempt);

  const definitions = await listQuizQuestionDefinitions(attempt.quizId);
  const answers = validateAnswers(definitions, input.answers);
  const questions = groupQuizQuestionDefinitions(definitions);
  if (answers.length !== questions.size) {
    throw new StudentServiceError(400, "Semua soal harus dijawab sebelum dikumpulkan.");
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
  if (!result) throw new StudentServiceError(409, "Quiz gagal dikumpulkan.");
  return result;
}

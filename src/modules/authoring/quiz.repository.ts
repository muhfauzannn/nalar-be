import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
  courseMembership,
  learningModule,
  quiz,
  quizAttempt,
  quizOption,
  quizQuestion,
} from "../../database/schema";
import { describeQuizProblems } from "../../lib/quiz-readiness";
import {
  assertBelowLimit,
  AuthoringServiceError,
  nextPosition,
  notFound,
  reorderSiblings,
  type Transaction,
} from "./authoring.shared";
import { teacherOf } from "./course.repository";

export type QuizStatus = "draft" | "published" | "closed" | "archived";

export type QuizSnapshot = {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  instructions: string | null;
  status: QuizStatus;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  publishedAt: Date | null;
  attemptCount: number;
};

export type QuizPatch = Partial<{
  title: string;
  instructions: string | null;
  moduleId: string | null;
  status: QuizStatus;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  publishedAt: Date;
}>;

export type QuestionInput =
  | {
      type: "multiple_choice";
      prompt: string;
      explanation: string | null;
      points: number;
      options: Array<{ label: string; isCorrect: boolean }>;
    }
  | {
      type: "short_answer";
      prompt: string;
      explanation: string | null;
      points: number;
      acceptedAnswers: string[];
    };

const QUESTION_LIMIT = 200;
const QUIZ_LIMIT_PER_COURSE = 200;

// ---- access -------------------------------------------------------------

export async function findTeacherQuiz(userId: string, quizId: string) {
  const [row] = await db
    .select({
      id: quiz.id,
      courseId: quiz.courseId,
      teacherMembershipId: courseMembership.id,
    })
    .from(quiz)
    .innerJoin(courseMembership, teacherOf(quiz.courseId, userId))
    .where(eq(quiz.id, quizId))
    .limit(1);
  return row ?? null;
}

export async function findTeacherQuestion(userId: string, questionId: string) {
  const [row] = await db
    .select({
      id: quizQuestion.id,
      quizId: quizQuestion.quizId,
      courseId: quiz.courseId,
    })
    .from(quizQuestion)
    .innerJoin(quiz, eq(quiz.id, quizQuestion.quizId))
    .innerJoin(courseMembership, teacherOf(quiz.courseId, userId))
    .where(eq(quizQuestion.id, questionId))
    .limit(1);
  return row ?? null;
}

export async function moduleBelongsToCourse(moduleId: string, courseId: string) {
  const [row] = await db
    .select({ id: learningModule.id })
    .from(learningModule)
    .where(and(eq(learningModule.id, moduleId), eq(learningModule.courseId, courseId)))
    .limit(1);
  return Boolean(row);
}

// ---- read ---------------------------------------------------------------

export async function getQuizEditor(quizId: string) {
  const [quizRow] = await db
    .select({
      id: quiz.id,
      courseId: quiz.courseId,
      moduleId: quiz.moduleId,
      title: quiz.title,
      instructions: quiz.instructions,
      status: quiz.status,
      availableAt: quiz.availableAt,
      dueAt: quiz.dueAt,
      closesAt: quiz.closesAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
    })
    .from(quiz)
    .where(eq(quiz.id, quizId))
    .limit(1);
  if (!quizRow) throw notFound();

  const rows = await db
    .select({
      questionId: quizQuestion.id,
      type: quizQuestion.type,
      prompt: quizQuestion.prompt,
      explanation: quizQuestion.explanation,
      acceptedAnswers: quizQuestion.acceptedAnswers,
      points: quizQuestion.points,
      position: quizQuestion.position,
      optionId: quizOption.id,
      optionLabel: quizOption.label,
      optionIsCorrect: quizOption.isCorrect,
      optionPosition: quizOption.position,
    })
    .from(quizQuestion)
    .leftJoin(quizOption, eq(quizOption.questionId, quizQuestion.id))
    .where(eq(quizQuestion.quizId, quizId))
    .orderBy(asc(quizQuestion.position), asc(quizOption.position));

  const questions = new Map<
    string,
    {
      id: string;
      type: "multiple_choice" | "short_answer";
      prompt: string;
      explanation: string | null;
      acceptedAnswers: string[] | null;
      points: number;
      position: number;
      options: Array<{ id: string; label: string; isCorrect: boolean; position: number }>;
    }
  >();
  for (const row of rows) {
    let question = questions.get(row.questionId);
    if (!question) {
      question = {
        id: row.questionId,
        type: row.type,
        prompt: row.prompt,
        explanation: row.explanation,
        acceptedAnswers: row.acceptedAnswers,
        points: Number(row.points),
        position: row.position,
        options: [],
      };
      questions.set(row.questionId, question);
    }
    if (row.optionId && row.optionLabel !== null && row.optionPosition !== null) {
      question.options.push({
        id: row.optionId,
        label: row.optionLabel,
        isCorrect: row.optionIsCorrect ?? false,
        position: row.optionPosition,
      });
    }
  }

  const [attempts] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(quizAttempt)
    .where(eq(quizAttempt.quizId, quizId));
  const attemptCount = attempts?.total ?? 0;

  const readiness = describeQuizProblems(
    rows.map((row) => ({
      questionId: row.questionId,
      questionType: row.type,
      acceptedAnswers: row.acceptedAnswers,
      points: row.points,
      optionId: row.optionId,
      isCorrect: row.optionIsCorrect,
    })),
  );

  return {
    quiz: quizRow,
    questions: [...questions.values()],
    attemptCount,
    // Content is only editable while the quiz is a draft nobody has started.
    locked: attemptCount > 0,
    editable: quizRow.status === "draft" && attemptCount === 0,
    readiness: {
      ready: readiness.questionCount > 0 && readiness.problems.length === 0,
      questionCount: readiness.questionCount,
      problems: readiness.problems,
    },
  };
}

// ---- guarded writes -----------------------------------------------------

async function loadLockedQuiz(tx: Transaction, quizId: string): Promise<QuizSnapshot | null> {
  const [row] = await tx.select().from(quiz).where(eq(quiz.id, quizId)).for("update");
  if (!row) return null;
  const [attempts] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(quizAttempt)
    .where(eq(quizAttempt.quizId, quizId));
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    availableAt: row.availableAt,
    dueAt: row.dueAt,
    closesAt: row.closesAt,
    timeLimitMinutes: row.timeLimitMinutes,
    publishedAt: row.publishedAt,
    attemptCount: attempts?.total ?? 0,
  };
}

// The quiz row is locked FOR UPDATE before the attempt count is read. A student
// starting an attempt inserts a row that references the quiz, which needs a
// KEY SHARE lock on it, so "teacher edits" and "student starts" cannot
// interleave: whichever is second sees the other's committed result.
export async function updateQuizGuarded(
  quizId: string,
  decide: (current: QuizSnapshot, tx: Transaction) => Promise<QuizPatch> | QuizPatch,
) {
  await db.transaction(async (tx) => {
    const current = await loadLockedQuiz(tx, quizId);
    if (!current) throw notFound();
    const patch = await decide(current, tx);
    if (Object.keys(patch).length > 0) {
      await tx.update(quiz).set(patch).where(eq(quiz.id, quizId));
    }
  });
}

export async function quizReadinessIn(tx: Transaction, quizId: string) {
  const rows = await tx
    .select({
      questionId: quizQuestion.id,
      questionType: quizQuestion.type,
      acceptedAnswers: quizQuestion.acceptedAnswers,
      points: quizQuestion.points,
      optionId: quizOption.id,
      isCorrect: quizOption.isCorrect,
    })
    .from(quizQuestion)
    .leftJoin(quizOption, eq(quizOption.questionId, quizQuestion.id))
    .where(eq(quizQuestion.quizId, quizId));
  return describeQuizProblems(rows);
}

async function mutateQuizContent<T>(
  quizId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const current = await loadLockedQuiz(tx, quizId);
    if (!current) throw notFound();
    if (current.attemptCount > 0) {
      throw new AuthoringServiceError(
        409,
        "Kuis sudah dikerjakan siswa, jadi soal, opsi, dan kunci tidak bisa diubah. Arsipkan kuis ini lalu buat salinan baru.",
        "QUIZ_LOCKED",
      );
    }
    if (current.status !== "draft") {
      throw new AuthoringServiceError(
        409,
        "Kembalikan kuis ke draft sebelum mengubah soal.",
        "QUIZ_NOT_DRAFT",
      );
    }
    return fn(tx);
  });
}

// ---- quizzes ------------------------------------------------------------

export async function createQuiz(input: {
  courseId: string;
  teacherMembershipId: string;
  moduleId: string | null;
  title: string;
  instructions: string | null;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
}) {
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(quiz)
    .where(eq(quiz.courseId, input.courseId));
  if ((countRow?.total ?? 0) >= QUIZ_LIMIT_PER_COURSE) {
    throw new AuthoringServiceError(
      409,
      `Jumlah kuis sudah mencapai batas maksimal ${QUIZ_LIMIT_PER_COURSE}.`,
      "LIMIT_REACHED",
    );
  }
  const [created] = await db
    .insert(quiz)
    .values({
      courseId: input.courseId,
      createdByCourseMembershipId: input.teacherMembershipId,
      moduleId: input.moduleId,
      title: input.title,
      instructions: input.instructions,
      availableAt: input.availableAt,
      dueAt: input.dueAt,
      closesAt: input.closesAt,
      timeLimitMinutes: input.timeLimitMinutes,
    })
    .returning({ id: quiz.id });
  return created;
}

export async function duplicateQuiz(quizId: string, teacherMembershipId: string) {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(quiz).where(eq(quiz.id, quizId));
    if (!source) throw notFound();

    const [copy] = await tx
      .insert(quiz)
      .values({
        courseId: source.courseId,
        moduleId: source.moduleId,
        createdByCourseMembershipId: teacherMembershipId,
        title: `${source.title} (salinan)`.slice(0, 160),
        instructions: source.instructions,
        availableAt: source.availableAt,
        dueAt: source.dueAt,
        closesAt: source.closesAt,
        timeLimitMinutes: source.timeLimitMinutes,
      })
      .returning({ id: quiz.id });
    if (!copy) throw new Error("Salinan kuis gagal dibuat.");

    const questions = await tx
      .select()
      .from(quizQuestion)
      .where(eq(quizQuestion.quizId, quizId))
      .orderBy(asc(quizQuestion.position));
    if (questions.length === 0) return copy;

    const idMap = new Map(questions.map((row) => [row.id, crypto.randomUUID()]));
    await tx.insert(quizQuestion).values(
      questions.map((row) => ({
        id: idMap.get(row.id)!,
        quizId: copy.id,
        type: row.type,
        prompt: row.prompt,
        explanation: row.explanation,
        acceptedAnswers: row.acceptedAnswers,
        points: row.points,
        position: row.position,
      })),
    );

    const options = await tx
      .select({
        questionId: quizOption.questionId,
        label: quizOption.label,
        isCorrect: quizOption.isCorrect,
        position: quizOption.position,
      })
      .from(quizOption)
      .innerJoin(quizQuestion, eq(quizQuestion.id, quizOption.questionId))
      .where(eq(quizQuestion.quizId, quizId));
    if (options.length > 0) {
      await tx.insert(quizOption).values(
        options.map((row) => ({
          questionId: idMap.get(row.questionId)!,
          label: row.label,
          isCorrect: row.isCorrect,
          position: row.position,
        })),
      );
    }
    return copy;
  });
}

// ---- questions ----------------------------------------------------------

function questionColumns(input: QuestionInput) {
  return {
    type: input.type,
    prompt: input.prompt,
    explanation: input.explanation,
    points: input.points.toFixed(2),
    acceptedAnswers: input.type === "short_answer" ? input.acceptedAnswers : null,
  };
}

function optionRows(questionId: string, input: QuestionInput) {
  if (input.type !== "multiple_choice") return [];
  return input.options.map((option, index) => ({
    questionId,
    label: option.label,
    isCorrect: option.isCorrect,
    position: index + 1,
  }));
}

export async function createQuestion(quizId: string, input: QuestionInput) {
  return mutateQuizContent(quizId, async (tx) => {
    await assertBelowLimit(tx, "quiz_question", quizId, QUESTION_LIMIT, "Jumlah soal");
    const position = await nextPosition(tx, "quiz_question", quizId);
    const [created] = await tx
      .insert(quizQuestion)
      .values({ quizId, position, ...questionColumns(input) })
      .returning({ id: quizQuestion.id });
    if (!created) throw new Error("Soal gagal dibuat.");
    const options = optionRows(created.id, input);
    if (options.length > 0) await tx.insert(quizOption).values(options);
    return created;
  });
}

export async function replaceQuestion(quizId: string, questionId: string, input: QuestionInput) {
  return mutateQuizContent(quizId, async (tx) => {
    const updated = await tx
      .update(quizQuestion)
      .set(questionColumns(input))
      .where(and(eq(quizQuestion.id, questionId), eq(quizQuestion.quizId, quizId)))
      .returning({ id: quizQuestion.id });
    if (updated.length === 0) throw notFound();

    await tx.delete(quizOption).where(eq(quizOption.questionId, questionId));
    const options = optionRows(questionId, input);
    if (options.length > 0) await tx.insert(quizOption).values(options);
    return { id: questionId };
  });
}

export async function deleteQuestion(quizId: string, questionId: string) {
  return mutateQuizContent(quizId, async (tx) => {
    await tx.delete(quizOption).where(eq(quizOption.questionId, questionId));
    await tx
      .delete(quizQuestion)
      .where(and(eq(quizQuestion.id, questionId), eq(quizQuestion.quizId, quizId)));
    return { deleted: true };
  });
}

export async function reorderQuestions(quizId: string, orderedIds: string[]) {
  return mutateQuizContent(quizId, async (tx) => {
    await reorderSiblings(tx, "quiz_question", quizId, orderedIds);
    return { ok: true };
  });
}

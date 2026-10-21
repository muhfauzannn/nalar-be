import {
  assertWorkStatusChange,
  AuthoringServiceError,
  notFound,
  validateSchedule,
} from "./authoring.shared";
import { findTeacherCourse } from "./course.repository";
import {
  createQuestion,
  createQuiz,
  deleteQuestion,
  duplicateQuiz,
  findTeacherQuestion,
  findTeacherQuiz,
  getQuizEditor,
  moduleBelongsToCourse,
  quizReadinessIn,
  reorderQuestions,
  replaceQuestion,
  updateQuizGuarded,
  type QuestionInput,
  type QuizStatus,
} from "./quiz.repository";

export type QuizInput = {
  title: string;
  instructions: string | null;
  moduleId: string | null;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
};

async function requireModuleInCourse(moduleId: string | null | undefined, courseId: string) {
  if (moduleId && !(await moduleBelongsToCourse(moduleId, courseId))) {
    throw new AuthoringServiceError(
      400,
      "Modul tidak termasuk dalam course ini.",
      "MODULE_NOT_IN_COURSE",
    );
  }
}

export async function createMyQuiz(userId: string, courseId: string, input: QuizInput) {
  const courseRow = await findTeacherCourse(userId, courseId);
  if (!courseRow) throw notFound();
  await requireModuleInCourse(input.moduleId, courseId);
  validateSchedule(input);
  return createQuiz({ courseId, teacherMembershipId: courseRow.teacherMembershipId, ...input });
}

export async function getMyQuiz(userId: string, quizId: string) {
  if (!(await findTeacherQuiz(userId, quizId))) throw notFound();
  return getQuizEditor(quizId);
}

export async function updateMyQuiz(
  userId: string,
  quizId: string,
  patch: Partial<QuizInput> & { status?: QuizStatus },
) {
  const access = await findTeacherQuiz(userId, quizId);
  if (!access) throw notFound();
  if (patch.moduleId !== undefined) await requireModuleInCourse(patch.moduleId, access.courseId);

  await updateQuizGuarded(quizId, async (current, tx) => {
    validateSchedule({
      availableAt: patch.availableAt !== undefined ? patch.availableAt : current.availableAt,
      dueAt: patch.dueAt !== undefined ? patch.dueAt : current.dueAt,
      closesAt: patch.closesAt !== undefined ? patch.closesAt : current.closesAt,
    });

    if (
      patch.timeLimitMinutes !== undefined &&
      patch.timeLimitMinutes !== current.timeLimitMinutes &&
      current.attemptCount > 0
    ) {
      throw new AuthoringServiceError(
        409,
        "Batas waktu tidak bisa diubah setelah ada siswa yang mengerjakan kuis.",
        "QUIZ_LOCKED",
      );
    }

    let publishedAt: Date | undefined;
    if (patch.status && patch.status !== current.status) {
      assertWorkStatusChange(current.status, patch.status, current.attemptCount > 0, "kuis");
      if (patch.status === "published") {
        const readiness = await quizReadinessIn(tx, quizId);
        if (readiness.questionCount === 0 || readiness.problems.length > 0) {
          throw new AuthoringServiceError(
            409,
            readiness.questionCount === 0
              ? "Kuis belum punya soal."
              : "Masih ada soal yang belum lengkap. Perbaiki sebelum menerbitkan kuis.",
            "QUIZ_NOT_READY",
          );
        }
        if (!current.publishedAt) publishedAt = new Date();
      }
    }

    return { ...patch, ...(publishedAt ? { publishedAt } : {}) };
  });
  return { id: quizId };
}

export async function copyMyQuiz(userId: string, quizId: string) {
  const access = await findTeacherQuiz(userId, quizId);
  if (!access) throw notFound();
  return duplicateQuiz(quizId, access.teacherMembershipId);
}

export async function addQuestion(userId: string, quizId: string, input: QuestionInput) {
  if (!(await findTeacherQuiz(userId, quizId))) throw notFound();
  return createQuestion(quizId, input);
}

export async function editQuestion(userId: string, questionId: string, input: QuestionInput) {
  const question = await findTeacherQuestion(userId, questionId);
  if (!question) throw notFound();
  return replaceQuestion(question.quizId, questionId, input);
}

export async function removeQuestion(userId: string, questionId: string) {
  const question = await findTeacherQuestion(userId, questionId);
  if (!question) throw notFound();
  return deleteQuestion(question.quizId, questionId);
}

export async function orderQuestions(userId: string, quizId: string, ids: string[]) {
  if (!(await findTeacherQuiz(userId, quizId))) throw notFound();
  return reorderQuestions(quizId, ids);
}

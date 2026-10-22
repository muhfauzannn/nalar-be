import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { generateJoinCode } from "../../lib/join-code";
import { quizDefinitionsAreReady } from "../../lib/quiz-readiness";
import { db } from "../client";
import { course, courseMembership, learningModule, lesson, quiz, quizOption, quizQuestion, subject, user } from "../schema";
import { scienceCourseContent, scienceQuestions } from "./science-course-content";

function seedId(ownerId: string, key: string) {
  const bytes = createHash("sha256").update(`nalar-science-seed:${ownerId}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function seedScienceCourse(ownerId: string) {
  const courseId = seedId(ownerId, "course");
  const quizId = seedId(ownerId, "quiz");
  const teacherId = seedId(ownerId, "teacher");
  const publishedAt = new Date();
  const questions = scienceQuestions.map((question, index) => ({
    id: seedId(ownerId, `question:${index + 1}`),
    quizId,
    type: "multiple_choice" as const,
    prompt: `[${question.subject}] ${question.prompt}`,
    explanation: question.explanation,
    points: "5.00",
    position: index + 1,
  }));
  const options = scienceQuestions.flatMap((question, questionIndex) => question.options.map((label, optionIndex) => ({
    id: seedId(ownerId, `option:${questionIndex + 1}:${optionIndex + 1}`),
    questionId: questions[questionIndex]!.id,
    label,
    isCorrect: optionIndex === question.correctIndex,
    position: optionIndex + 1,
  })));
  const definitions = options.map((option) => ({
    questionId: option.questionId,
    questionType: "multiple_choice" as const,
    acceptedAnswers: null,
    points: "5.00",
    optionId: option.id,
    isCorrect: option.isCorrect,
  }));
  if (questions.length !== 20 || !quizDefinitionsAreReady(definitions)) {
    throw new Error("Kuis MIPA harus berisi 20 soal dengan pilihan dan kunci yang lengkap.");
  }

  const created = await db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).limit(1);
    if (!owner) throw new Error("Akun pengajar belum terdaftar.");

    await tx.insert(subject).values({ code: "MIPA", name: "MIPA Terpadu" }).onConflictDoNothing({ target: subject.code });
    const [category] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.code, "MIPA")).limit(1);
    if (!category) throw new Error("Kategori MIPA gagal disiapkan.");
    const inserted = await tx.insert(course).values({
      id: courseId,
      subjectId: category.id,
      name: scienceCourseContent.name,
      description: scienceCourseContent.description,
      joinCode: generateJoinCode(),
      status: "published",
    }).onConflictDoNothing({ target: course.id }).returning({ id: course.id });

    // A rerun leaves teacher edits, uploaded PDFs, publication state, and attempts intact.
    if (!inserted.length) return false;

    await tx.insert(courseMembership).values([
      { id: teacherId, courseId, userId: ownerId, role: "teacher", status: "active", activatedAt: publishedAt },
      { id: seedId(ownerId, "student"), courseId, userId: ownerId, role: "student", status: "active", activatedAt: publishedAt },
    ]);

    for (const [moduleIndex, module] of scienceCourseContent.modules.entries()) {
      const moduleId = seedId(ownerId, `module:${module.key}`);
      await tx.insert(learningModule).values({
        id: moduleId,
        courseId,
        title: module.title,
        description: module.description,
        position: moduleIndex + 1,
        status: "published",
        publishedAt,
      });
      await tx.insert(lesson).values(module.lessons.map((material, lessonIndex) => ({
        id: seedId(ownerId, `lesson:${module.key}:${lessonIndex + 1}`),
        moduleId,
        title: material.title,
        content: material.content,
        position: lessonIndex + 1,
        status: "published" as const,
        publishedAt,
      })));
    }

    await tx.insert(quiz).values({
      id: quizId,
      courseId,
      createdByCourseMembershipId: teacherId,
      title: scienceCourseContent.quizTitle,
      instructions: scienceCourseContent.quizInstructions,
      status: "published",
      timeLimitMinutes: 60,
      // No future opening or closing date: the quiz stays available until the teacher changes it.
      availableAt: null,
      dueAt: null,
      closesAt: null,
      publishedAt,
    });
    await tx.insert(quizQuestion).values(questions);
    await tx.insert(quizOption).values(options);
    return true;
  });
  return { created, courseId, quizId };
}

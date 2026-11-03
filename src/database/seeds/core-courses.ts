import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { generateJoinCode } from "../../lib/join-code";
import { quizDefinitionsAreReady } from "../../lib/quiz-readiness";
import { findLab } from "../../modules/labs/lab-catalog";
import { db } from "../client";
import { referenceSubjects } from "../reference-data";
import { course, courseMembership, learningModule, lesson, lessonLab, quiz, quizOption, quizQuestion, subject, user } from "../schema";
import { coreCourses, type CoreCourse } from "./core-courses-content";

function seedId(ownerId: string, key: string) {
  const bytes = createHash("sha256").update(`nalar-core-seed:${ownerId}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const POINTS = "10.00";

/** The content lists the right answer first; each question's options are turned by a fixed amount so the key is not always A. */
function rotated(options: CoreCourse["questions"][number]["options"], by: number) {
  const turn = by % options.length;
  return [...options.slice(turn), ...options.slice(0, turn)].map((label) => ({ label, isCorrect: label === options[0] }));
}

function rowsFor(ownerId: string, content: CoreCourse) {
  const id = (key: string) => seedId(ownerId, `${content.key}:${key}`);
  const quizId = id("quiz");
  const questions = content.questions.map((question, index) => ({
    id: id(`question:${index + 1}`),
    quizId,
    type: "multiple_choice" as const,
    prompt: question.prompt,
    explanation: question.explanation,
    points: POINTS,
    position: index + 1,
  }));
  const options = content.questions.flatMap((question, questionIndex) =>
    rotated(question.options, questionIndex * 3 + 1).map((option, optionIndex) => ({
      id: id(`option:${questionIndex + 1}:${optionIndex + 1}`),
      questionId: questions[questionIndex]!.id,
      label: option.label,
      isCorrect: option.isCorrect,
      position: optionIndex + 1,
    })),
  );
  const definitions = options.map((option) => ({ questionId: option.questionId, questionType: "multiple_choice" as const, acceptedAnswers: null, points: POINTS, optionId: option.id, isCorrect: option.isCorrect }));
  if (!quizDefinitionsAreReady(definitions)) throw new Error(`Latihan ${content.name} belum lengkap kuncinya.`);
  if (!findLab(content.labKey)) throw new Error(`Lab ${content.labKey} tidak ada di katalog.`);
  return { courseId: id("course"), moduleId: id("module"), lessonId: id("lesson"), teacherId: id("teacher"), quizId, questions, options };
}

/**
 * Creates the four core courses (Matematika, Fisika, Kimia, Biologi), each
 * with one lesson, its lab and an untimed practice quiz, owned by `ownerId`.
 * A course that already exists is left as it is, so a rerun keeps edits,
 * enrolments and attempts.
 */
export async function seedCoreCourses(ownerId: string) {
  const publishedAt = new Date();
  const results: Array<{ name: string; courseId: string; quizId: string; created: boolean }> = [];

  await db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).limit(1);
    if (!owner) throw new Error("Akun pengajar belum terdaftar.");
    await tx.insert(subject).values(referenceSubjects).onConflictDoNothing({ target: subject.code });

    for (const content of coreCourses) {
      const rows = rowsFor(ownerId, content);
      const [category] = await tx.select({ id: subject.id }).from(subject).where(eq(subject.code, content.subjectCode)).limit(1);
      if (!category) throw new Error(`Mata pelajaran ${content.subjectCode} belum ada.`);
      const inserted = await tx
        .insert(course)
        .values({ id: rows.courseId, subjectId: category.id, name: content.name, description: content.description, joinCode: generateJoinCode(), status: "published" })
        .onConflictDoNothing({ target: course.id })
        .returning({ id: course.id });
      results.push({ name: content.name, courseId: rows.courseId, quizId: rows.quizId, created: inserted.length > 0 });
      if (!inserted.length) continue;

      await tx.insert(courseMembership).values([
        { id: rows.teacherId, courseId: rows.courseId, userId: ownerId, role: "teacher", status: "active", activatedAt: publishedAt },
        { id: seedId(ownerId, `${content.key}:student`), courseId: rows.courseId, userId: ownerId, role: "student", status: "active", activatedAt: publishedAt },
      ]);
      await tx.insert(learningModule).values({ id: rows.moduleId, courseId: rows.courseId, title: content.module.title, description: content.module.description, position: 1, status: "published", publishedAt });
      await tx.insert(lesson).values({ id: rows.lessonId, moduleId: rows.moduleId, title: content.lesson.title, content: content.lesson.content, position: 1, status: "published", publishedAt });
      await tx.insert(lessonLab).values({ id: seedId(ownerId, `${content.key}:lab`), lessonId: rows.lessonId, labKey: content.labKey });
      await tx.insert(quiz).values({
        id: rows.quizId,
        courseId: rows.courseId,
        moduleId: rows.moduleId,
        createdByCourseMembershipId: rows.teacherId,
        title: content.quizTitle,
        instructions: content.quizInstructions,
        status: "published",
        // practice: no time limit and no closing date
        timeLimitMinutes: null,
        availableAt: null,
        dueAt: null,
        closesAt: null,
        publishedAt,
      });
      await tx.insert(quizQuestion).values(rows.questions);
      await tx.insert(quizOption).values(rows.options);
    }
  });
  return results;
}

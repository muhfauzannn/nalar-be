import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";

import { fileStorage, newResourceKey, removeQuietly } from "../../lib/file-storage";
import { generateJoinCode } from "../../lib/join-code";
import { quizDefinitionsAreReady } from "../../lib/quiz-readiness";
import { findLab } from "../../modules/labs/lab-catalog";
import { db } from "../client";
import { referenceSubjects } from "../reference-data";
import { assignment, course, courseMembership, learningModule, learningResource, lesson, lessonLab, quiz, quizOption, quizQuestion, rubric, rubricCriterion, scenario, subject, user } from "../schema";
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
  return {
    courseId: id("course"),
    moduleId: id("module"),
    lessonId: id("lesson"),
    teacherId: id("teacher"),
    quizId,
    questions,
    options,
    templateRubricId: id("rubric:template"),
    scenarioId: id("scenario"),
    assignmentRubricId: id("rubric:assignment"),
    assignmentId: id("assignment"),
    handoutId: id("handout"),
  };
}

/**
 * Creates the four core courses (Matematika, Fisika, Kimia, Biologi), each
 * with one lesson, its lab and an untimed practice quiz, owned by `ownerId`.
 * A course that already exists is left as it is, so a rerun keeps edits,
 * enrolments and attempts. Every run then adds what a course is missing of its
 * AI parts: the NALAR scenario assignment and the lesson's PDF handout.
 */
export async function seedCoreCourses(ownerId: string) {
  const publishedAt = new Date();
  const results: Array<{ name: string; courseId: string; quizId: string; assignmentId: string; created: boolean; handoutAdded: boolean }> = [];

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
      results.push({ name: content.name, courseId: rows.courseId, quizId: rows.quizId, assignmentId: rows.assignmentId, created: inserted.length > 0, handoutAdded: false });
      if (inserted.length) {
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
      await addAssignment(tx, rows, category.id, content, publishedAt);
    }
  });

  // The handout's bytes go to file storage, which a transaction cannot roll back,
  // so each one is stored only when its lesson does not have it yet.
  for (const [index, content] of coreCourses.entries()) {
    results[index]!.handoutAdded = await addHandout(rowsFor(ownerId, content), content);
  }
  return results;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Rows = ReturnType<typeof rowsFor>;

/** The course's NALAR assignment: a scenario with its template rubric, and the assignment with its own copy of that rubric. */
async function addAssignment(tx: Tx, rows: Rows, subjectId: string, content: CoreCourse, publishedAt: Date) {
  const [courseRow] = await tx.select({ id: course.id }).from(course).where(eq(course.id, rows.courseId));
  if (!courseRow) return;
  const task = content.assignment;
  const criteriaOf = (rubricId: string) =>
    task.criteria.map(([label, description, maxPoints], index) => ({ id: seedId(rubricId, `criterion:${index + 1}`), rubricId, label, description, maxPoints, position: index + 1 }));

  await tx.insert(rubric).values({ id: rows.templateRubricId, name: `Rubrik ${task.scenarioTitle}`, isTemplate: true, lockedAt: publishedAt }).onConflictDoNothing({ target: rubric.id });
  await tx.insert(rubricCriterion).values(criteriaOf(rows.templateRubricId)).onConflictDoNothing({ target: rubricCriterion.id });
  await tx
    .insert(scenario)
    .values({ id: rows.scenarioId, subjectId, title: task.scenarioTitle, instructions: task.scenarioInstructions, defaultRubricId: rows.templateRubricId })
    .onConflictDoNothing({ target: scenario.id });
  await tx
    .insert(rubric)
    .values({ id: rows.assignmentRubricId, name: `Rubrik: ${task.title}`, isTemplate: false, sourceRubricId: rows.templateRubricId })
    .onConflictDoNothing({ target: rubric.id });
  await tx.insert(rubricCriterion).values(criteriaOf(rows.assignmentRubricId)).onConflictDoNothing({ target: rubricCriterion.id });
  await tx
    .insert(assignment)
    .values({
      id: rows.assignmentId,
      courseId: rows.courseId,
      moduleId: rows.moduleId,
      scenarioId: rows.scenarioId,
      rubricId: rows.assignmentRubricId,
      createdByCourseMembershipId: rows.teacherId,
      title: task.title,
      instructions: task.instructions,
      status: "published",
      // practice: open now, no deadline, two attempts
      availableAt: null,
      dueAt: null,
      closesAt: null,
      maxAttempts: 2,
      publishedAt,
    })
    .onConflictDoNothing({ target: assignment.id });
}

/** Uploads the lesson's PDF handout once; returns whether it was added now. */
async function addHandout(rows: Rows, content: CoreCourse) {
  const [lessonRow] = await db.select({ id: lesson.id }).from(lesson).where(eq(lesson.id, rows.lessonId));
  if (!lessonRow) return false;
  const [existing] = await db.select({ id: learningResource.id }).from(learningResource).where(eq(learningResource.id, rows.handoutId));
  if (existing) return false;

  const bytes = new Uint8Array(await readFile(new URL(`./handouts/${content.handout.file}`, import.meta.url)));
  const key = newResourceKey();
  await fileStorage.save(key, bytes);
  try {
    const [last] = await db
      .select({ position: sql<number>`coalesce(max(${learningResource.position}), 0)::int` })
      .from(learningResource)
      .where(eq(learningResource.lessonId, rows.lessonId));
    const added = await db
      .insert(learningResource)
      .values({
        id: rows.handoutId,
        lessonId: rows.lessonId,
        type: "file",
        title: content.handout.title,
        content: content.handout.content,
        fileKey: key,
        fileName: content.handout.file,
        fileSize: bytes.length,
        position: (last?.position ?? 0) + 1,
      })
      .onConflictDoNothing({ target: learningResource.id })
      .returning({ id: learningResource.id });
    if (!added.length) await removeQuietly(key);
    return added.length > 0;
  } catch (error) {
    await removeQuietly(key);
    throw error;
  }
}

import { and, asc, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "../../database/client";
import { publicResource } from "../../lib/pdf-upload";
import {
  assignment,
  course,
  courseMembership,
  learningModule,
  learningResource,
  lesson,
  quiz,
  rubric,
  rubricCriterion,
  scenario,
  subject,
} from "../../database/schema";
import {
  assertBelowLimit,
  nextPosition,
  reorderSiblings,
} from "./authoring.shared";

type CourseStatus = "draft" | "published" | "archived";
type PublicationStatus = "draft" | "published" | "archived";

// ---- access -------------------------------------------------------------
//
// Authorization is "active teacher membership of the course the entity lives
// in". Every lookup below joins up to the course, so an id that belongs to
// someone else is indistinguishable from an id that does not exist.

export function teacherOf(courseIdColumn: AnyPgColumn, userId: string) {
  return and(
    eq(courseMembership.courseId, courseIdColumn),
    eq(courseMembership.userId, userId),
    eq(courseMembership.role, "teacher"),
    eq(courseMembership.status, "active"),
  );
}

export async function findTeacherCourse(userId: string, courseId: string) {
  const [row] = await db
    .select({
      id: course.id,
      name: course.name,
      description: course.description,
      status: course.status,
      subjectId: course.subjectId,
      subjectName: subject.name,
      joinCode: course.joinCode,
      teacherMembershipId: courseMembership.id,
    })
    .from(course)
    .innerJoin(subject, eq(subject.id, course.subjectId))
    .innerJoin(courseMembership, teacherOf(course.id, userId))
    .where(eq(course.id, courseId))
    .limit(1);
  return row ?? null;
}

export async function findTeacherModule(userId: string, moduleId: string) {
  const [row] = await db
    .select({
      id: learningModule.id,
      courseId: learningModule.courseId,
      title: learningModule.title,
      description: learningModule.description,
      status: learningModule.status,
      publishedAt: learningModule.publishedAt,
    })
    .from(learningModule)
    .innerJoin(courseMembership, teacherOf(learningModule.courseId, userId))
    .where(eq(learningModule.id, moduleId))
    .limit(1);
  return row ?? null;
}

export async function findTeacherLesson(userId: string, lessonId: string) {
  const [row] = await db
    .select({
      id: lesson.id,
      moduleId: lesson.moduleId,
      courseId: learningModule.courseId,
      title: lesson.title,
      content: lesson.content,
      status: lesson.status,
      publishedAt: lesson.publishedAt,
    })
    .from(lesson)
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(courseMembership, teacherOf(learningModule.courseId, userId))
    .where(eq(lesson.id, lessonId))
    .limit(1);
  return row ?? null;
}

export async function findTeacherResource(userId: string, resourceId: string) {
  const [row] = await db
    .select({
      id: learningResource.id,
      lessonId: learningResource.lessonId,
      courseId: learningModule.courseId,
      type: learningResource.type,
      title: learningResource.title,
      content: learningResource.content,
      url: learningResource.url,
      fileKey: learningResource.fileKey,
      fileName: learningResource.fileName,
      fileSize: learningResource.fileSize,
    })
    .from(learningResource)
    .innerJoin(lesson, eq(lesson.id, learningResource.lessonId))
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(courseMembership, teacherOf(learningModule.courseId, userId))
    .where(eq(learningResource.id, resourceId))
    .limit(1);
  return row ?? null;
}

// ---- reference data -----------------------------------------------------

export async function listSubjects() {
  return db
    .select({ id: subject.id, code: subject.code, name: subject.name })
    .from(subject)
    .orderBy(asc(subject.name));
}

export async function findSubject(subjectId: string) {
  const [row] = await db
    .select({ id: subject.id })
    .from(subject)
    .where(eq(subject.id, subjectId))
    .limit(1);
  return row ?? null;
}

export async function listActiveScenarios() {
  const scenarios = await db
    .select({
      id: scenario.id,
      title: scenario.title,
      instructions: scenario.instructions,
      subjectName: subject.name,
      defaultRubricId: scenario.defaultRubricId,
    })
    .from(scenario)
    .innerJoin(subject, eq(subject.id, scenario.subjectId))
    .where(eq(scenario.isActive, true))
    .orderBy(asc(subject.name), asc(scenario.title));

  const rubricIds = [...new Set(scenarios.map((row) => row.defaultRubricId))];
  const criteria = rubricIds.length
    ? await db
        .select({
          rubricId: rubricCriterion.rubricId,
          label: rubricCriterion.label,
          description: rubricCriterion.description,
          maxPoints: rubricCriterion.maxPoints,
          position: rubricCriterion.position,
        })
        .from(rubricCriterion)
        .innerJoin(rubric, eq(rubric.id, rubricCriterion.rubricId))
        .where(inArray(rubricCriterion.rubricId, rubricIds))
        .orderBy(asc(rubricCriterion.position))
    : [];

  return scenarios.map(({ defaultRubricId, ...row }) => ({
    ...row,
    criteria: criteria
      .filter((criterion) => criterion.rubricId === defaultRubricId)
      .map((criterion) => ({
        label: criterion.label,
        description: criterion.description,
        maxPoints: Number(criterion.maxPoints),
      })),
  }));
}

// ---- courses ------------------------------------------------------------

// Teachers enroll to test the learning flow, but are not counted as their own pupils.
function countedStudent() {
  const teacher = alias(courseMembership, "counted_student_teacher");
  return and(
    eq(courseMembership.role, "student"),
    inArray(courseMembership.status, ["active", "completed"]),
    notExists(
      db.select({ id: teacher.id }).from(teacher).where(and(
        eq(teacher.courseId, courseMembership.courseId),
        eq(teacher.userId, courseMembership.userId),
        eq(teacher.role, "teacher"),
        eq(teacher.status, "active"),
      )),
    ),
  );
}

export async function countTeachingCourses(userId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(courseMembership)
    .where(and(eq(courseMembership.userId, userId), eq(courseMembership.role, "teacher")));
  return row?.total ?? 0;
}

export async function createCourseWithTeacher(input: {
  userId: string;
  name: string;
  description: string | null;
  subjectId: string;
  joinCode: string;
}) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(course)
      .values({
        name: input.name,
        description: input.description,
        subjectId: input.subjectId,
        joinCode: input.joinCode,
      })
      .returning({ id: course.id });
    if (!created) throw new Error("Course gagal dibuat.");

    await tx.insert(courseMembership).values([{
      courseId: created.id,
      userId: input.userId,
      role: "teacher",
      status: "active",
      activatedAt: new Date(),
    }, {
      courseId: created.id,
      userId: input.userId,
      role: "student",
      status: "active",
      activatedAt: new Date(),
    }]);
    return created;
  });
}

export async function listTeacherCourses(userId: string) {
  const rows = await db
    .select({
      id: course.id,
      name: course.name,
      description: course.description,
      status: course.status,
      subjectName: subject.name,
      joinCode: course.joinCode,
      createdAt: course.createdAt,
    })
    .from(courseMembership)
    .innerJoin(course, eq(course.id, courseMembership.courseId))
    .innerJoin(subject, eq(subject.id, course.subjectId))
    .where(
      and(
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "teacher"),
        eq(courseMembership.status, "active"),
      ),
    )
    .orderBy(desc(course.createdAt));

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const [students, quizzes, assignments] = await Promise.all([
    db
      .select({ courseId: courseMembership.courseId, total: sql<number>`count(*)::int` })
      .from(courseMembership)
      .where(
        and(
          inArray(courseMembership.courseId, ids),
          countedStudent(),
        ),
      )
      .groupBy(courseMembership.courseId),
    db
      .select({ courseId: quiz.courseId, total: sql<number>`count(*)::int` })
      .from(quiz)
      .where(and(inArray(quiz.courseId, ids), sql`${quiz.status} <> 'archived'`))
      .groupBy(quiz.courseId),
    db
      .select({ courseId: assignment.courseId, total: sql<number>`count(*)::int` })
      .from(assignment)
      .where(and(inArray(assignment.courseId, ids), sql`${assignment.status} <> 'archived'`))
      .groupBy(assignment.courseId),
  ]);

  const totalFor = (list: Array<{ courseId: string; total: number }>, id: string) =>
    list.find((entry) => entry.courseId === id)?.total ?? 0;

  return rows.map((row) => ({
    ...row,
    studentCount: totalFor(students, row.id),
    quizCount: totalFor(quizzes, row.id),
    assignmentCount: totalFor(assignments, row.id),
  }));
}

// Everything the course editor needs in one round trip, all statuses included
// so archived items can be restored.
export async function getCourseEditor(courseId: string) {
  const modules = await db
    .select({
      id: learningModule.id,
      title: learningModule.title,
      description: learningModule.description,
      position: learningModule.position,
      status: learningModule.status,
    })
    .from(learningModule)
    .where(eq(learningModule.courseId, courseId))
    .orderBy(asc(learningModule.position));

  const moduleIds = modules.map((row) => row.id);
  const lessons = moduleIds.length
    ? await db
        .select({
          id: lesson.id,
          moduleId: lesson.moduleId,
          title: lesson.title,
          content: lesson.content,
          position: lesson.position,
          status: lesson.status,
        })
        .from(lesson)
        .where(inArray(lesson.moduleId, moduleIds))
        .orderBy(asc(lesson.position))
    : [];

  const lessonIds = lessons.map((row) => row.id);
  const resources = lessonIds.length
    ? (
        await db
          .select({
            id: learningResource.id,
            lessonId: learningResource.lessonId,
            type: learningResource.type,
            title: learningResource.title,
            content: learningResource.content,
            url: learningResource.url,
            fileName: learningResource.fileName,
            fileSize: learningResource.fileSize,
            position: learningResource.position,
          })
          .from(learningResource)
          .where(inArray(learningResource.lessonId, lessonIds))
          .orderBy(asc(learningResource.position))
      ).map(publicResource)
    : [];

  const [quizzes, assignments, studentRows] = await Promise.all([
    db
      .select({
        id: quiz.id,
        title: quiz.title,
        status: quiz.status,
        moduleId: quiz.moduleId,
        dueAt: quiz.dueAt,
        closesAt: quiz.closesAt,
        questionCount: sql<number>`(select count(*)::int from quiz_question where quiz_question.quiz_id = "quiz"."id")`,
        attemptCount: sql<number>`(select count(*)::int from quiz_attempt where quiz_attempt.quiz_id = "quiz"."id")`,
      })
      .from(quiz)
      .where(eq(quiz.courseId, courseId))
      .orderBy(asc(quiz.createdAt)),
    db
      .select({
        id: assignment.id,
        title: assignment.title,
        status: assignment.status,
        moduleId: assignment.moduleId,
        scenarioTitle: scenario.title,
        dueAt: assignment.dueAt,
        closesAt: assignment.closesAt,
        submissionCount: sql<number>`(select count(*)::int from submission where submission.assignment_id = "assignment"."id")`,
      })
      .from(assignment)
      .innerJoin(scenario, eq(scenario.id, assignment.scenarioId))
      .where(eq(assignment.courseId, courseId))
      .orderBy(asc(assignment.createdAt)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(courseMembership)
      .where(
        and(
          eq(courseMembership.courseId, courseId),
          countedStudent(),
        ),
      ),
  ]);

  return {
    studentCount: studentRows[0]?.total ?? 0,
    modules: modules.map((moduleRow) => ({
      ...moduleRow,
      lessons: lessons
        .filter((lessonRow) => lessonRow.moduleId === moduleRow.id)
        .map((lessonRow) => ({
          ...lessonRow,
          resources: resources.filter((resource) => resource.lessonId === lessonRow.id),
        })),
    })),
    quizzes,
    assignments,
  };
}

export async function updateCourse(
  courseId: string,
  patch: {
    name?: string;
    description?: string | null;
    subjectId?: string;
    status?: CourseStatus;
  },
) {
  await db.update(course).set(patch).where(eq(course.id, courseId));
}

export async function setCourseJoinCode(courseId: string, joinCode: string | null) {
  await db.update(course).set({ joinCode }).where(eq(course.id, courseId));
}

// ---- modules ------------------------------------------------------------

const MODULE_LIMIT = 100;
const LESSON_LIMIT = 200;
const RESOURCE_LIMIT = 50;

export async function createModule(
  courseId: string,
  input: { title: string; description: string | null; status: PublicationStatus },
) {
  return db.transaction(async (tx) => {
    await tx.select({ id: course.id }).from(course).where(eq(course.id, courseId)).for("update");
    await assertBelowLimit(tx, "learning_module", courseId, MODULE_LIMIT, "Jumlah modul");
    const position = await nextPosition(tx, "learning_module", courseId);
    const [created] = await tx
      .insert(learningModule)
      .values({
        courseId,
        title: input.title,
        description: input.description,
        position,
        status: input.status,
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .returning({ id: learningModule.id });
    return created;
  });
}

export async function updateModule(
  moduleId: string,
  patch: {
    title?: string;
    description?: string | null;
    status?: PublicationStatus;
    publishedAt?: Date;
  },
) {
  await db.update(learningModule).set(patch).where(eq(learningModule.id, moduleId));
}

export async function reorderModules(courseId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.select({ id: course.id }).from(course).where(eq(course.id, courseId)).for("update");
    await reorderSiblings(tx, "learning_module", courseId, orderedIds);
  });
}

// ---- lessons ------------------------------------------------------------

export async function createLesson(
  moduleId: string,
  input: { title: string; content: string | null; status: PublicationStatus },
) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: learningModule.id })
      .from(learningModule)
      .where(eq(learningModule.id, moduleId))
      .for("update");
    await assertBelowLimit(tx, "lesson", moduleId, LESSON_LIMIT, "Jumlah lesson");
    const position = await nextPosition(tx, "lesson", moduleId);
    const [created] = await tx
      .insert(lesson)
      .values({
        moduleId,
        title: input.title,
        content: input.content,
        position,
        status: input.status,
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .returning({ id: lesson.id });
    return created;
  });
}

export async function updateLesson(
  lessonId: string,
  patch: {
    title?: string;
    content?: string | null;
    status?: PublicationStatus;
    publishedAt?: Date;
  },
) {
  await db.update(lesson).set(patch).where(eq(lesson.id, lessonId));
}

export async function reorderLessons(moduleId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    await tx
      .select({ id: learningModule.id })
      .from(learningModule)
      .where(eq(learningModule.id, moduleId))
      .for("update");
    await reorderSiblings(tx, "lesson", moduleId, orderedIds);
  });
}

// ---- resources ----------------------------------------------------------

export type ResourceInput = {
  type: "text" | "link" | "file";
  title: string;
  content: string | null;
  url: string | null;
};

export type StoredFile = { key: string; name: string; size: number };
export type FileResourceInput = { title: string; content: string | null; file: StoredFile };

const NO_FILE = { fileKey: null, fileName: null, fileSize: null } as const;
const fileColumns = (file: StoredFile) => ({
  fileKey: file.key,
  fileName: file.name,
  fileSize: file.size,
});

async function insertResource(lessonId: string, values: Omit<typeof learningResource.$inferInsert, "lessonId" | "position">) {
  return db.transaction(async (tx) => {
    await tx.select({ id: lesson.id }).from(lesson).where(eq(lesson.id, lessonId)).for("update");
    await assertBelowLimit(tx, "learning_resource", lessonId, RESOURCE_LIMIT, "Jumlah resource");
    const position = await nextPosition(tx, "learning_resource", lessonId);
    const [created] = await tx
      .insert(learningResource)
      .values({ lessonId, position, ...values })
      .returning({ id: learningResource.id });
    return created;
  });
}

export async function createResource(lessonId: string, input: ResourceInput) {
  return insertResource(lessonId, input);
}

export async function createFileResource(lessonId: string, input: FileResourceInput) {
  return insertResource(lessonId, {
    type: "file",
    title: input.title,
    content: input.content,
    url: null,
    ...fileColumns(input.file),
  });
}

// A text/link/URL-file edit. Switching an uploaded resource to one of these leaves it
// without a file, so the columns are cleared here and the caller removes the bytes.
export async function updateResource(resourceId: string, input: ResourceInput) {
  await db
    .update(learningResource)
    .set({ ...input, ...NO_FILE })
    .where(eq(learningResource.id, resourceId));
}

// Only the words around an uploaded file changed.
export async function updateResourceText(
  resourceId: string,
  input: { title: string; content: string | null },
) {
  await db.update(learningResource).set(input).where(eq(learningResource.id, resourceId));
}

// Also used to turn an old URL-only 'file' resource into an upload.
export async function replaceResourceFile(resourceId: string, input: FileResourceInput) {
  const updated = await db
    .update(learningResource)
    .set({
      type: "file",
      title: input.title,
      content: input.content,
      url: null,
      ...fileColumns(input.file),
    })
    .where(eq(learningResource.id, resourceId))
    .returning({ id: learningResource.id });
  return updated.length > 0;
}

// Bytes already stored by an account, counted over the courses they teach.
export async function storedBytesOf(userId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${learningResource.fileSize}), 0)::float8` })
    .from(learningResource)
    .innerJoin(lesson, eq(lesson.id, learningResource.lessonId))
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(courseMembership, teacherOf(learningModule.courseId, userId));
  return row?.total ?? 0;
}

// Nothing references a resource, so (unlike lessons and modules, which carry
// student progress) it can be removed for real.
export async function deleteResource(resourceId: string) {
  await db.delete(learningResource).where(eq(learningResource.id, resourceId));
}

export async function reorderResources(lessonId: string, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.select({ id: lesson.id }).from(lesson).where(eq(lesson.id, lessonId)).for("update");
    await reorderSiblings(tx, "learning_resource", lessonId, orderedIds);
  });
}

export async function getLessonEditor(lessonId: string) {
  const [row] = await db
    .select({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      status: lesson.status,
      moduleId: learningModule.id,
      moduleTitle: learningModule.title,
      courseId: course.id,
      courseName: course.name,
    })
    .from(lesson)
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(course, eq(course.id, learningModule.courseId))
    .where(eq(lesson.id, lessonId))
    .limit(1);
  if (!row) return null;

  const resources = (
    await db
      .select({
        id: learningResource.id,
        type: learningResource.type,
        title: learningResource.title,
        content: learningResource.content,
        url: learningResource.url,
        fileName: learningResource.fileName,
        fileSize: learningResource.fileSize,
        position: learningResource.position,
      })
      .from(learningResource)
      .where(eq(learningResource.lessonId, lessonId))
      .orderBy(asc(learningResource.position))
  ).map(publicResource);

  return { lesson: row, resources };
}

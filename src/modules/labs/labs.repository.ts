import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "../../database/client";
import {
  course,
  courseMembership,
  labChallengeCompletion,
  learningModule,
  lesson,
  lessonLab,
} from "../../database/schema";

export async function listLessonLabs(lessonId: string) {
  return db
    .select({ id: lessonLab.id, labKey: lessonLab.labKey })
    .from(lessonLab)
    .where(eq(lessonLab.lessonId, lessonId))
    .orderBy(asc(lessonLab.createdAt));
}

export async function insertLessonLab(lessonId: string, labKey: string) {
  const [row] = await db
    .insert(lessonLab)
    .values({ lessonId, labKey })
    .onConflictDoNothing()
    .returning({ id: lessonLab.id });
  return row ?? null;
}

export async function findLessonLab(labId: string) {
  const [row] = await db
    .select({ id: lessonLab.id, lessonId: lessonLab.lessonId, labKey: lessonLab.labKey })
    .from(lessonLab)
    .where(eq(lessonLab.id, labId))
    .limit(1);
  return row ?? null;
}

export async function countLabCompletions(labId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(labChallengeCompletion)
    .where(eq(labChallengeCompletion.lessonLabId, labId));
  return row?.total ?? 0;
}

export async function deleteLessonLab(labId: string) {
  await db.delete(lessonLab).where(eq(lessonLab.id, labId));
}

// A lab the student can open: same visibility rule as the lesson it sits on.
export async function findStudentLab(labId: string, userId: string) {
  const [row] = await db
    .select({
      id: lessonLab.id,
      labKey: lessonLab.labKey,
      membershipId: courseMembership.id,
      membershipStatus: courseMembership.status,
    })
    .from(lessonLab)
    .innerJoin(lesson, eq(lesson.id, lessonLab.lessonId))
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(course, eq(course.id, learningModule.courseId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.courseId, course.id),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    )
    .where(
      and(
        eq(lessonLab.id, labId),
        eq(lesson.status, "published"),
        eq(learningModule.status, "published"),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertChallengeCompletion(labId: string, membershipId: string, challenge: string) {
  const [row] = await db
    .insert(labChallengeCompletion)
    .values({ lessonLabId: labId, studentCourseMembershipId: membershipId, challenge })
    .onConflictDoNothing()
    .returning({ id: labChallengeCompletion.id });
  return row ?? null;
}

export async function listLabCompletions(membershipIds: string[]) {
  if (membershipIds.length === 0) return [];
  return db
    .select({
      lessonLabId: labChallengeCompletion.lessonLabId,
      membershipId: labChallengeCompletion.studentCourseMembershipId,
      challenge: labChallengeCompletion.challenge,
      createdAt: labChallengeCompletion.createdAt,
    })
    .from(labChallengeCompletion)
    .where(inArray(labChallengeCompletion.studentCourseMembershipId, membershipIds));
}

// Every lab in a course, for the island's districts.
export async function listCourseLabs(courseId: string) {
  return db
    .select({ id: lessonLab.id, lessonId: lessonLab.lessonId, labKey: lessonLab.labKey })
    .from(lessonLab)
    .innerJoin(lesson, eq(lesson.id, lessonLab.lessonId))
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .where(and(eq(learningModule.courseId, courseId), eq(lesson.status, "published")));
}

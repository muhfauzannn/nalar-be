import { and, eq } from "drizzle-orm";

import { db } from "../../database/client";
import { course, courseMembership } from "../../database/schema";

export async function findCourseByJoinCode(joinCode: string) {
  const [row] = await db
    .select({ id: course.id, name: course.name, status: course.status })
    .from(course)
    .where(eq(course.joinCode, joinCode))
    .limit(1);
  return row ?? null;
}

export async function listCourseRoles(courseId: string, userId: string) {
  return db
    .select({
      id: courseMembership.id,
      role: courseMembership.role,
      status: courseMembership.status,
    })
    .from(courseMembership)
    .where(and(eq(courseMembership.courseId, courseId), eq(courseMembership.userId, userId)));
}

export async function createStudentMembership(courseId: string, userId: string) {
  await db.insert(courseMembership).values({
    courseId,
    userId,
    role: "student",
    status: "active",
    activatedAt: new Date(),
  });
}

export async function activateMembership(membershipId: string) {
  await db
    .update(courseMembership)
    .set({ status: "active", activatedAt: new Date() })
    .where(eq(courseMembership.id, membershipId));
}

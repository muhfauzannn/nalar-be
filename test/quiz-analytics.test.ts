import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import { db } from "../src/database/client";
import { courseMembership, quizAttempt, quizUsageReflection } from "../src/database/schema";
import { api, expectNoKeys, joinCourse, makeCourse, newUser, publishCourse, type Client } from "./helpers";

type Reliance = "none" | "low" | "moderate" | "high";

async function setup() {
  const teacher = await newUser("teacher");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, { title: "Kuis Gelombang" });
  expect(created.status).toBe(201);
  return { teacher, course, quizId: created.body.id as string };
}

async function student(joinCode: string, label: string) {
  const client = await newUser(label);
  expect((await joinCourse(client, joinCode)).status).toBe(200);
  const [membership] = await db
    .select({ id: courseMembership.id, courseId: courseMembership.courseId })
    .from(courseMembership)
    .where(and(eq(courseMembership.userId, client.id), eq(courseMembership.role, "student")));
  return { client, membershipId: membership!.id };
}

// An attempt and, once it is submitted, the reflection the tutor analysis wrote for it.
async function attempt(
  quizId: string,
  membershipId: string,
  options: {
    number?: number;
    status?: "in_progress" | "submitted";
    reflection?: { level: Reliance; turns?: number; direct?: number; hint?: number; reflective?: number; redirected?: number; report?: string };
  } = {},
) {
  const status = options.status ?? "submitted";
  const [row] = await db
    .insert(quizAttempt)
    .values({
      quizId,
      studentCourseMembershipId: membershipId,
      attemptNumber: options.number ?? 1,
      status,
      score: status === "submitted" ? "80.00" : null,
      submittedAt: status === "submitted" ? new Date("2026-10-01T09:00:00Z") : null,
    })
    .returning({ id: quizAttempt.id });
  if (options.reflection) {
    const { level, turns = 0, direct = 0, hint = 0, reflective = 0, redirected = 0, report } = options.reflection;
    await db.insert(quizUsageReflection).values({
      quizAttemptId: row!.id,
      relianceLevel: level,
      studentReport: report ?? `Laporan ${level}.`,
      recommendations: ["Coba dulu sebelum bertanya."],
      promptTurnCount: turns,
      directCount: direct,
      hintCount: hint,
      reflectiveCount: reflective,
      redirectedCount: redirected,
      scoringVersion: "test",
      computedAt: new Date("2026-10-01T09:05:00Z"),
    });
  }
  return row!.id;
}

const analytics = (client: Client | null, quizId: string) => api(client, "GET", `/api/manage/quizzes/${quizId}/analytics`);

describe("teacher view of how students used the tutor in a quiz", () => {
  test("only the course's teacher can read it", async () => {
    const { teacher, course, quizId } = await setup();
    const learner = await student(course.joinCode, "siswa");
    await attempt(quizId, learner.membershipId, { reflection: { level: "low" } });
    const stranger = await newUser("stranger");

    expect((await analytics(teacher, quizId)).status).toBe(200);
    expect((await analytics(learner.client, quizId)).status).toBe(404);
    expect((await analytics(stranger, quizId)).status).toBe(404);
    expect((await analytics(null, quizId)).status).toBe(401);
    expect((await analytics(teacher, crypto.randomUUID())).status).toBe(404);
  });

  test("lists every enrolled student with the reflection of their latest attempt", async () => {
    const { teacher, course, quizId } = await setup();
    const ani = await student(course.joinCode, "Ani");
    const budi = await student(course.joinCode, "Budi");
    const citra = await student(course.joinCode, "Citra");
    await student(course.joinCode, "Dodi");

    await attempt(quizId, ani.membershipId, {
      reflection: { level: "low", turns: 5, direct: 0, hint: 3, reflective: 2, redirected: 0, report: "Kamu bertanya dengan hati-hati." },
    });
    // Budi's first try leaned on the tutor, the retry did not: the class view follows the retry.
    await attempt(quizId, budi.membershipId, { number: 1, reflection: { level: "high", turns: 8, direct: 7, redirected: 4 } });
    await attempt(quizId, budi.membershipId, { number: 2, reflection: { level: "none" } });
    // Citra is still working: her attempt has no reflection yet.
    await attempt(quizId, citra.membershipId, { status: "in_progress" });

    const reply = await analytics(teacher, quizId);
    expect(reply.status).toBe(200);
    expect(reply.body.quiz).toMatchObject({ id: quizId, title: "Kuis Gelombang", status: "draft", courseId: course.id });
    expect(reply.body.counts).toEqual({ enrolled: 4, notStarted: 1, inProgress: 1, submitted: 2, reflected: 2 });
    expect(reply.body.distribution).toEqual([
      { level: "none", count: 1 },
      { level: "low", count: 1 },
      { level: "moderate", count: 0 },
      { level: "high", count: 0 },
    ]);

    const rows = reply.body.students as Array<{ name: string; status: string; attemptNumber: number | null; reflection: any }>;
    expect(rows.map((row) => row.name)).toEqual(["Ani", "Budi", "Citra", "Dodi"]);
    expect(rows[0]).toMatchObject({ status: "submitted", attemptNumber: 1 });
    expect(rows[0]!.reflection).toMatchObject({
      relianceLevel: "low",
      studentReport: "Kamu bertanya dengan hati-hati.",
      recommendations: ["Coba dulu sebelum bertanya."],
      promptTurnCount: 5,
      hintCount: 3,
      reflectiveCount: 2,
    });
    expect(rows[1]).toMatchObject({ status: "submitted", attemptNumber: 2 });
    expect(rows[1]!.reflection.relianceLevel).toBe("none");
    expect(rows[2]).toMatchObject({ status: "in_progress", attemptNumber: 1, reflection: null });
    expect(rows[3]).toMatchObject({ status: "not_started", attemptNumber: null, reflection: null });
  });

  test("leaves out the teacher's own preview attempt and never carries a score", async () => {
    const { teacher, course, quizId } = await setup();
    const learner = await student(course.joinCode, "Ani");
    await attempt(quizId, learner.membershipId, { reflection: { level: "moderate", turns: 4, direct: 2, hint: 2 } });
    const [teacherMembership] = await db
      .select({ id: courseMembership.id })
      .from(courseMembership)
      .where(and(eq(courseMembership.userId, teacher.id), eq(courseMembership.courseId, course.id)));
    await attempt(quizId, teacherMembership!.id, { reflection: { level: "high", turns: 9, direct: 9 } });

    const reply = await analytics(teacher, quizId);
    expect(reply.body.counts).toMatchObject({ enrolled: 1, submitted: 1, reflected: 1 });
    expect(reply.body.students.map((row: { name: string }) => row.name)).toEqual(["Ani"]);
    expect(reply.body.distribution.find((row: { level: string }) => row.level === "high").count).toBe(0);
    // The attempt above scored 80: the reflection stays apart from the result (PRD §5.3A).
    expect(expectNoKeys(reply.body, ["score", "points"])).toEqual([]);
  });

  test("a quiz nobody took shows an empty class, not an error", async () => {
    const { teacher, course, quizId } = await setup();
    await student(course.joinCode, "Ani");
    const reply = await analytics(teacher, quizId);
    expect(reply.status).toBe(200);
    expect(reply.body.counts).toEqual({ enrolled: 1, notStarted: 1, inProgress: 0, submitted: 0, reflected: 0 });
    expect(reply.body.distribution.every((row: { count: number }) => row.count === 0)).toBe(true);
  });
});

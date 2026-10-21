import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import { db } from "../src/database/client";
import { courseMembership } from "../src/database/schema";
import { joinRateLimiter } from "../src/modules/enrollment/enrollment.service";
import { api, joinCourse, makeCourse, newUser, publishCourse } from "./helpers";

describe("joining a course with a class code", () => {
  test("a published course can be joined; it then appears in the student's course list", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher, { name: "Biologi Sel" });
    await publishCourse(teacher, course.id);

    const joined = await joinCourse(student, course.joinCode);
    expect(joined.status).toBe(200);
    expect(joined.body).toEqual({
      course: { id: course.id, name: "Biologi Sel" },
      alreadyJoined: false,
    });

    const list = await api(student, "GET", "/api/student/courses");
    expect(list.body.courses.map((entry: { id: string }) => entry.id)).toEqual([course.id]);
    // The same account is a student here and still has no teacher rights.
    expect((await api(student, "GET", `/api/manage/courses/${course.id}`)).status).toBe(404);
  });

  test("lower case, spaces and hyphens in the typed code are tolerated", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);

    const typed = `${course.joinCode.slice(0, 4)}-${course.joinCode.slice(4)}`.toLowerCase();
    const student = await newUser("student");
    expect((await joinCourse(student, `  ${typed} `)).status).toBe(200);
  });

  test("joining twice is idempotent and creates exactly one membership", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);

    expect((await joinCourse(student, course.joinCode)).body.alreadyJoined).toBe(false);
    expect((await joinCourse(student, course.joinCode)).body.alreadyJoined).toBe(true);

    const rows = await db
      .select({ id: courseMembership.id })
      .from(courseMembership)
      .where(and(eq(courseMembership.courseId, course.id), eq(courseMembership.userId, student.id)));
    expect(rows).toHaveLength(1);
  });

  test("two simultaneous taps on Join still produce one membership", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);

    const replies = await Promise.all(
      Array.from({ length: 5 }, () => joinCourse(student, course.joinCode)),
    );
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
    expect(replies.filter((reply) => reply.body.alreadyJoined === false)).toHaveLength(1);

    const rows = await db
      .select({ id: courseMembership.id })
      .from(courseMembership)
      .where(and(eq(courseMembership.courseId, course.id), eq(courseMembership.userId, student.id)));
    expect(rows).toHaveLength(1);
  });

  test("unknown code, draft course, disabled code and archived course all answer identically", async () => {
    const teacher = await newUser("teacher");
    const outsider = await newUser("outsider");
    joinRateLimiter.reset(outsider.id);

    const draft = await makeCourse(teacher);
    const disabled = await makeCourse(teacher);
    await publishCourse(teacher, disabled.id);
    await api(teacher, "DELETE", `/api/manage/courses/${disabled.id}/join-code`);
    const archived = await makeCourse(teacher);
    await publishCourse(teacher, archived.id);
    await api(teacher, "PATCH", `/api/manage/courses/${archived.id}`, { status: "archived" });

    const attempts = [
      "ZZZZZZZZ", // never existed
      draft.joinCode, // exists, not published
      disabled.joinCode, // was valid, now switched off
      archived.joinCode, // exists, archived
    ];
    const replies = [];
    for (const code of attempts) replies.push(await joinCourse(outsider, code));
    for (const reply of replies) {
      expect(reply.status).toBe(404);
      expect(reply.body).toEqual({
        error: "Kode kelas tidak valid atau course belum dibuka.",
        code: "JOIN_CODE_INVALID",
      });
    }
    joinRateLimiter.reset(outsider.id);
  });

  test("regenerating the code invalidates the old one", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const later = await newUser("later");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);

    const reset = await api(teacher, "POST", `/api/manage/courses/${course.id}/join-code`);
    expect(reset.status).toBe(200);
    expect(reset.body.joinCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(reset.body.joinCode).not.toBe(course.joinCode);

    expect((await joinCourse(student, course.joinCode)).status).toBe(404);
    expect((await joinCourse(later, reset.body.joinCode)).status).toBe(200);
  });

  test("the teacher cannot enroll as a student in their own course", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);

    const reply = await joinCourse(teacher, course.joinCode);
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe("JOIN_IS_TEACHER");
  });

  test("requires a session and a string code", async () => {
    expect((await api(null, "POST", "/api/courses/join", { code: "ABCDEFGH" })).status).toBe(401);
    const user = await newUser("user");
    expect((await api(user, "POST", "/api/courses/join", {})).status).toBe(400);
    expect((await api(user, "POST", "/api/courses/join", { code: 12345678 })).status).toBe(400);
  });
});

describe("class code brute-force protection", () => {
  test("10 wrong codes lock the caller out with Retry-After, even for a correct code", async () => {
    const teacher = await newUser("teacher");
    const attacker = await newUser("attacker");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    joinRateLimiter.reset(attacker.id);

    for (let guess = 0; guess < 10; guess += 1) {
      const reply = await joinCourse(attacker, `WRONG${String(guess).padStart(3, "2")}`);
      expect(reply.status).toBe(404);
    }

    const blocked = await joinCourse(attacker, course.joinCode); // correct, but too late
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("JOIN_RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    // The lock belongs to the account, not to the course or the code.
    const innocent = await newUser("innocent");
    expect((await joinCourse(innocent, course.joinCode)).status).toBe(200);
    joinRateLimiter.reset(attacker.id);
  });

  test("a successful join does not clear earlier failures", async () => {
    const teacher = await newUser("teacher");
    const attacker = await newUser("attacker");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    joinRateLimiter.reset(attacker.id);

    // Alternate guesses with an (idempotent) valid join: the counter must still grow.
    expect((await joinCourse(attacker, course.joinCode)).status).toBe(200);
    for (let guess = 0; guess < 10; guess += 1) {
      await joinCourse(attacker, `NOPE${String(guess).padStart(4, "2")}`);
      expect((await joinCourse(attacker, course.joinCode)).status).toBeOneOf([200, 429]);
    }
    expect((await joinCourse(attacker, "ANOTHER2")).status).toBe(429);
    joinRateLimiter.reset(attacker.id);
  });
});

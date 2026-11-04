import { describe, expect, test } from "bun:test";

import { byDueDate, upcomingWork } from "../src/modules/student/student.service";
import { api, joinCourse, makeCourse, multipleChoice, newUser, publishCourse } from "./helpers";

// The deadlines on the world's HUD are what the student still has to do in each
// course, soonest first. The same rule fills the dashboard's list.

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 9, 0, 0));
const course = { id: "course-a", name: "Fisika Kelas XI" };
const assignment = (id: string, dueAt: Date | null, submissionStatus: string | null = null) => ({ id, title: `Tugas ${id}`, dueAt, submissionStatus });
const quiz = (id: string, dueAt: Date | null, attemptStatus: string) => ({ id, title: `Kuis ${id}`, dueAt, attemptStatus });

describe("upcomingWork", () => {
  test("keeps an assignment that is not handed in and a quiz not taken, and tells them apart", () => {
    const work = upcomingWork(
      course,
      [assignment("a1", day(5)), assignment("a2", day(6), "in_progress"), assignment("a3", day(7), "submitted"), assignment("a4", day(8), "returned")],
      [quiz("q1", day(9), "not_started"), quiz("q2", day(10), "in_progress"), quiz("q3", day(11), "submitted"), quiz("q4", day(12), "expired"), quiz("q5", day(13), "archived")],
    );
    expect(work.map((item) => `${item.type}:${item.id}`)).toEqual(["assignment:a1", "assignment:a2", "quiz:q1", "quiz:q2"]);
  });

  test("names the course by id as well, so the front end can fly to its island", () => {
    const [item] = upcomingWork(course, [assignment("a1", day(5))], []);
    expect(item).toEqual({ id: "a1", courseId: "course-a", type: "assignment", title: "Tugas a1", courseName: "Fisika Kelas XI", dueAt: day(5), status: "not_started" });
  });
});

describe("byDueDate", () => {
  test("sorts the soonest first and what has no due date last", () => {
    const items = [{ dueAt: null }, { dueAt: day(9) }, { dueAt: day(3) }, { dueAt: null }, { dueAt: day(6) }];
    expect(items.sort(byDueDate).map((item) => item.dueAt?.getUTCDate() ?? null)).toEqual([3, 6, 9, null, null]);
  });
});

async function quizWithDue(teacher: Awaited<ReturnType<typeof newUser>>, courseId: string, title: string, dueAt: Date | null) {
  const created = await api(teacher, "POST", `/api/manage/courses/${courseId}/quizzes`, { title, dueAt: dueAt?.toISOString() ?? null });
  expect(created.status).toBe(201);
  const quizId = created.body.id as string;
  expect((await api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, multipleChoice())).status).toBe(201);
  expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { status: "published" })).status).toBe(200);
  return quizId;
}

describe("GET /api/student/world", () => {
  test("lists the open work with a due date, soonest first, each with its course", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    const later = new Date(Date.now() + 6 * 24 * 3600 * 1000);
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    const laterId = await quizWithDue(teacher, course.id, "Kuis nanti", later);
    const soonId = await quizWithDue(teacher, course.id, "Kuis besok", soon);
    await quizWithDue(teacher, course.id, "Kuis tanpa batas", null);

    const student = await newUser("siswa");
    expect((await joinCourse(student, course.joinCode)).status).toBe(200);
    const reply = await api(student, "GET", "/api/student/world");
    expect(reply.status).toBe(200);

    expect(reply.body.upcoming.map((item: { id: string }) => item.id)).toEqual([soonId, laterId]);
    expect(reply.body.upcoming[0]).toMatchObject({ courseId: course.id, type: "quiz", title: "Kuis besok", status: "not_started", dueAt: soon.toISOString() });
  });

  test("a student with nothing due gets an empty list", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    const student = await newUser("siswa");
    expect((await joinCourse(student, course.joinCode)).status).toBe(200);
    const reply = await api(student, "GET", "/api/student/world");
    expect(reply.body.upcoming).toEqual([]);
  });
});

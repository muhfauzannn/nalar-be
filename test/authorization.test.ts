import { beforeAll, describe, expect, test } from "bun:test";

import {
  api,
  joinCourse,
  makeCourse,
  makeScenario,
  multipleChoice,
  newUser,
  publishCourse,
  type Client,
} from "./helpers";

// The authorization matrix: role x resource x action.
//   owner      = active teacher of the course        -> allowed
//   stranger   = signed in, unrelated to the course  -> indistinguishable from "does not exist"
//   student    = enrolled student of the course      -> indistinguishable from "does not exist"
//   anonymous  = no session                          -> 401
// Teacher-ness is a per-course membership, never an account type.

type Fixture = {
  courseId: string;
  moduleId: string;
  lessonId: string;
  resourceId: string;
  quizId: string;
  questionId: string;
  assignmentId: string;
  scenarioId: string;
};

type Probe = {
  name: string;
  method: string;
  path: (f: Fixture) => string;
  body?: (f: Fixture) => unknown;
};

const probes: Probe[] = [
  { name: "baca course", method: "GET", path: (f) => `/courses/${f.courseId}` },
  { name: "ubah course", method: "PATCH", path: (f) => `/courses/${f.courseId}`, body: () => ({ name: "Dibajak" }) },
  { name: "reset kode kelas", method: "POST", path: (f) => `/courses/${f.courseId}/join-code` },
  { name: "matikan kode kelas", method: "DELETE", path: (f) => `/courses/${f.courseId}/join-code` },
  { name: "tambah modul", method: "POST", path: (f) => `/courses/${f.courseId}/modules`, body: () => ({ title: "X" }) },
  { name: "urut modul", method: "PUT", path: (f) => `/courses/${f.courseId}/modules/order`, body: (f) => ({ ids: [f.moduleId] }) },
  { name: "ubah modul", method: "PATCH", path: (f) => `/modules/${f.moduleId}`, body: () => ({ title: "X" }) },
  { name: "arsip modul", method: "DELETE", path: (f) => `/modules/${f.moduleId}` },
  { name: "tambah lesson", method: "POST", path: (f) => `/modules/${f.moduleId}/lessons`, body: () => ({ title: "X" }) },
  { name: "urut lesson", method: "PUT", path: (f) => `/modules/${f.moduleId}/lessons/order`, body: (f) => ({ ids: [f.lessonId] }) },
  { name: "baca lesson", method: "GET", path: (f) => `/lessons/${f.lessonId}` },
  { name: "ubah lesson", method: "PATCH", path: (f) => `/lessons/${f.lessonId}`, body: () => ({ title: "X" }) },
  { name: "arsip lesson", method: "DELETE", path: (f) => `/lessons/${f.lessonId}` },
  { name: "tambah resource", method: "POST", path: (f) => `/lessons/${f.lessonId}/resources`, body: () => ({ type: "text", title: "X", content: "isi" }) },
  { name: "urut resource", method: "PUT", path: (f) => `/lessons/${f.lessonId}/resources/order`, body: (f) => ({ ids: [f.resourceId] }) },
  { name: "ubah resource", method: "PATCH", path: (f) => `/resources/${f.resourceId}`, body: () => ({ type: "text", title: "X", content: "isi" }) },
  { name: "hapus resource", method: "DELETE", path: (f) => `/resources/${f.resourceId}` },
  { name: "buat kuis", method: "POST", path: (f) => `/courses/${f.courseId}/quizzes`, body: () => ({ title: "X" }) },
  { name: "baca kuis (berisi kunci)", method: "GET", path: (f) => `/quizzes/${f.quizId}` },
  { name: "ubah kuis", method: "PATCH", path: (f) => `/quizzes/${f.quizId}`, body: () => ({ title: "X" }) },
  { name: "arsip kuis", method: "DELETE", path: (f) => `/quizzes/${f.quizId}` },
  { name: "salin kuis", method: "POST", path: (f) => `/quizzes/${f.quizId}/duplicate` },
  { name: "tambah soal", method: "POST", path: (f) => `/quizzes/${f.quizId}/questions`, body: () => multipleChoice() },
  { name: "urut soal", method: "PUT", path: (f) => `/quizzes/${f.quizId}/questions/order`, body: (f) => ({ ids: [f.questionId] }) },
  { name: "ubah soal", method: "PUT", path: (f) => `/questions/${f.questionId}`, body: () => multipleChoice() },
  { name: "hapus soal", method: "DELETE", path: (f) => `/questions/${f.questionId}` },
  { name: "buat assignment", method: "POST", path: (f) => `/courses/${f.courseId}/assignments`, body: (f) => ({ scenarioId: f.scenarioId }) },
  { name: "baca assignment", method: "GET", path: (f) => `/assignments/${f.assignmentId}` },
  { name: "ubah assignment", method: "PATCH", path: (f) => `/assignments/${f.assignmentId}`, body: () => ({ title: "X" }) },
  { name: "arsip assignment", method: "DELETE", path: (f) => `/assignments/${f.assignmentId}` },
  { name: "salin assignment", method: "POST", path: (f) => `/assignments/${f.assignmentId}/duplicate` },
  {
    name: "ganti rubrik",
    method: "PUT",
    path: (f) => `/assignments/${f.assignmentId}/criteria`,
    body: () => ({ criteria: [{ label: "A", description: "B", maxPoints: 100 }] }),
  },
];

async function buildFixture(owner: Client): Promise<Fixture> {
  const { id: courseId } = await makeCourse(owner);
  const scenario = await makeScenario();

  const module = await api(owner, "POST", `/api/manage/courses/${courseId}/modules`, { title: "Modul 1" });
  const moduleId = module.body.id as string;
  const lesson = await api(owner, "POST", `/api/manage/modules/${moduleId}/lessons`, { title: "Lesson 1" });
  const lessonId = lesson.body.id as string;
  const resource = await api(owner, "POST", `/api/manage/lessons/${lessonId}/resources`, {
    type: "link",
    title: "Bacaan",
    url: "https://example.com/bacaan",
  });
  const quiz = await api(owner, "POST", `/api/manage/courses/${courseId}/quizzes`, { title: "Kuis 1" });
  const quizId = quiz.body.id as string;
  const question = await api(owner, "POST", `/api/manage/quizzes/${quizId}/questions`, multipleChoice());
  const assignment = await api(owner, "POST", `/api/manage/courses/${courseId}/assignments`, {
    scenarioId: scenario.id,
  });

  for (const reply of [module, lesson, resource, quiz, question, assignment]) {
    if (reply.status !== 201) throw new Error(`fixture gagal: ${JSON.stringify(reply.body)}`);
  }
  return {
    courseId,
    moduleId,
    lessonId,
    resourceId: resource.body.id,
    quizId,
    questionId: question.body.id,
    assignmentId: assignment.body.id,
    scenarioId: scenario.id,
  };
}

async function snapshot(owner: Client, f: Fixture) {
  const [course, quiz, assignment] = await Promise.all([
    api(owner, "GET", `/api/manage/courses/${f.courseId}`),
    api(owner, "GET", `/api/manage/quizzes/${f.quizId}`),
    api(owner, "GET", `/api/manage/assignments/${f.assignmentId}`),
  ]);
  return JSON.stringify([course.body, quiz.body, assignment.body]);
}

describe("authoring authorization matrix", () => {
  let owner: Client;
  let stranger: Client;
  let student: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    [owner, stranger, student] = await Promise.all([
      newUser("owner"),
      newUser("stranger"),
      newUser("student"),
    ]);
    fixture = await buildFixture(owner);
    await publishCourse(owner, fixture.courseId);
    const editor = await api(owner, "GET", `/api/manage/courses/${fixture.courseId}`);
    const joined = await joinCourse(student, editor.body.course.joinCode);
    expect(joined.status).toBe(200);
  });

  test("anonymous callers get 401 on every endpoint", async () => {
    for (const probe of probes) {
      const reply = await api(null, probe.method, `/api/manage${probe.path(fixture)}`, probe.body?.(fixture));
      expect({ probe: probe.name, status: reply.status }).toEqual({ probe: probe.name, status: 401 });
    }
  });

  for (const role of ["stranger", "student"] as const) {
    test(`${role}: every id-bearing endpoint answers exactly like a missing id, and nothing changes`, async () => {
      const actor = role === "stranger" ? stranger : student;
      const before = await snapshot(owner, fixture);

      // A syntactically valid id that exists nowhere: the reference answer.
      const ghost = {
        ...fixture,
        ...Object.fromEntries(Object.keys(fixture).map((key) => [key, crypto.randomUUID()])),
      } as Fixture;

      for (const probe of probes) {
        const real = await api(actor, probe.method, `/api/manage${probe.path(fixture)}`, probe.body?.(fixture));
        const missing = await api(actor, probe.method, `/api/manage${probe.path(ghost)}`, probe.body?.(ghost));
        expect({ probe: probe.name, status: real.status, body: real.body }).toEqual({
          probe: probe.name,
          status: 404,
          body: { error: "Data tidak ditemukan.", code: "NOT_FOUND" },
        });
        // No existence oracle: foreign id and nonexistent id are the same answer.
        expect(real.body).toEqual(missing.body);
        expect(real.status).toBe(missing.status);
      }

      expect(await snapshot(owner, fixture)).toBe(before);
    });
  }

  test("the owner is allowed everywhere on a fresh fixture", async () => {
    const mine = await buildFixture(owner);
    for (const probe of probes) {
      // Destructive probes run last-to-first dependencies, so reuse is safe
      // because DELETE archives and order/PUT bodies reference live ids.
      const reply = await api(owner, probe.method, `/api/manage${probe.path(mine)}`, probe.body?.(mine));
      expect({ probe: probe.name, ok: reply.status < 300 || reply.status === 409 }).toEqual({
        probe: probe.name,
        ok: true,
      });
      // 409 is a business rule (e.g. archived/locked), never an authorization failure.
      expect(reply.status).not.toBe(404);
      expect(reply.status).not.toBe(401);
    }
  });

  test("list endpoints only ever return the caller's own courses", async () => {
    const theirs = await api(stranger, "GET", "/api/manage/courses");
    expect(theirs.status).toBe(200);
    expect(theirs.body.courses.map((course: { id: string }) => course.id)).not.toContain(
      fixture.courseId,
    );

    // The enrolled student is not a teacher of the course either.
    const asStudent = await api(student, "GET", "/api/manage/courses");
    expect(asStudent.body.courses.map((course: { id: string }) => course.id)).not.toContain(
      fixture.courseId,
    );
  });

  test("two different owners cannot reach each other's content through a shared module id", async () => {
    const other = await newUser("other-owner");
    const { id: otherCourse } = await makeCourse(other);
    // Attach a quiz in the OTHER course to a module that belongs to THIS course.
    const reply = await api(other, "POST", `/api/manage/courses/${otherCourse}/quizzes`, {
      title: "Silang",
      moduleId: fixture.moduleId,
    });
    expect(reply.status).toBe(400);
    expect(reply.body.code).toBe("MODULE_NOT_IN_COURSE");
  });
});

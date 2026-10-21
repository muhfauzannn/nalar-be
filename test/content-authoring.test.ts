import { describe, expect, test } from "bun:test";

import {
  api,
  firstSubjectId,
  joinCourse,
  makeCourse,
  newUser,
  publishCourse,
  type Client,
} from "./helpers";

describe("any registered user can create a course", () => {
  test("the creator becomes its teacher, gets a class code, and the course starts as a draft", async () => {
    const user = await newUser("newcomer"); // never seeded, no school, no setup
    const subjectId = await firstSubjectId(user);

    const created = await api(user, "POST", "/api/manage/courses", {
      name: "  Fisika Dasar  ",
      description: "Gerak dan gaya.",
      subjectId,
    });
    expect(created.status).toBe(201);

    const editor = await api(user, "GET", `/api/manage/courses/${created.body.id}`);
    expect(editor.body.course).toMatchObject({
      name: "Fisika Dasar",
      description: "Gerak dan gaya.",
      status: "draft",
      subjectId,
    });
    expect(editor.body.course.joinCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(editor.body.studentCount).toBe(0);

    const list = await api(user, "GET", "/api/manage/courses");
    expect(list.body.courses).toHaveLength(1);
    expect(list.body.courses[0]).toMatchObject({ id: created.body.id, studentCount: 0, quizCount: 0 });
  });

  test("invalid input is rejected", async () => {
    const user = await newUser("user");
    const subjectId = await firstSubjectId(user);
    const post = (body: unknown) => api(user, "POST", "/api/manage/courses", body);

    expect((await post({ subjectId })).status).toBe(400);
    expect((await post({ name: "   ", subjectId })).status).toBe(400);
    expect((await post({ name: "x".repeat(121), subjectId })).status).toBe(400);
    expect((await post({ name: "Ok", subjectId, description: "x".repeat(2001) })).status).toBe(400);
    expect((await post({ name: "Ok" })).status).toBe(400);
    expect((await post({ name: "Ok", subjectId: "bukan-uuid" })).status).toBe(400);
    const unknown = await post({ name: "Ok", subjectId: crypto.randomUUID() });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("SUBJECT_NOT_FOUND");
    expect((await api(user, "POST", "/api/manage/courses")).status).toBe(400); // no body at all
  });

  test("one account cannot hoard more than 50 courses", async () => {
    const user = await newUser("hoarder");
    const subjectId = await firstSubjectId(user);
    for (let index = 0; index < 50; index += 1) {
      const reply = await api(user, "POST", "/api/manage/courses", { name: `C${index}`, subjectId });
      expect(reply.status).toBe(201);
    }
    const over = await api(user, "POST", "/api/manage/courses", { name: "C50", subjectId });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LIMIT_REACHED");
  });

  test("the subject list is available to everyone signed in and is alphabetical", async () => {
    const user = await newUser("user");
    const reply = await api(user, "GET", "/api/manage/subjects");
    const names: string[] = reply.body.subjects.map((subject: { name: string }) => subject.name);
    expect(names).toContain("Matematika");
    expect(names).toContain("Bahasa Indonesia");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("course status", () => {
  test("draft -> published -> archived -> published is allowed", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    for (const status of ["published", "archived", "published"]) {
      const reply = await api(teacher, "PATCH", `/api/manage/courses/${course.id}`, { status });
      expect({ status, http: reply.status }).toEqual({ status, http: 200 });
    }
    expect((await api(teacher, "PATCH", `/api/manage/courses/${course.id}`, { status: "bogus" })).status).toBe(400);
  });

  test("a course that has students cannot go back to draft", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    await joinCourse(student, course.joinCode);

    const reply = await api(teacher, "PATCH", `/api/manage/courses/${course.id}`, { status: "draft" });
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe("INVALID_TRANSITION");
    expect((await api(teacher, "GET", `/api/manage/courses/${course.id}`)).body.studentCount).toBe(1);
  });

  test("an archived course stays readable for enrolled students but accepts no newcomers", async () => {
    const teacher = await newUser("teacher");
    const early = await newUser("early");
    const late = await newUser("late");
    const course = await makeCourse(teacher, { name: "Sejarah Lokal" });
    await publishCourse(teacher, course.id);
    await joinCourse(early, course.joinCode);

    await api(teacher, "PATCH", `/api/manage/courses/${course.id}`, { status: "archived" });
    const still = await api(early, "GET", "/api/student/courses");
    expect(still.body.courses.map((c: any) => [c.name, c.status])).toEqual([["Sejarah Lokal", "archived"]]);
    expect((await joinCourse(late, course.joinCode)).status).toBe(404);
  });

  test("name, description and subject can be edited; a blank description clears it", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher, { description: "Awal" });
    const subjects = (await api(teacher, "GET", "/api/manage/subjects")).body.subjects;
    const other = subjects[1].id;

    const reply = await api(teacher, "PATCH", `/api/manage/courses/${course.id}`, {
      name: "Nama Baru",
      description: "   ",
      subjectId: other,
    });
    expect(reply.status).toBe(200);
    const editor = await api(teacher, "GET", `/api/manage/courses/${course.id}`);
    expect(editor.body.course).toMatchObject({ name: "Nama Baru", description: null, subjectId: other });
  });

  test("the class code can be switched off and a new one issued", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const off = await api(teacher, "DELETE", `/api/manage/courses/${course.id}/join-code`);
    expect(off.body.joinCode).toBeNull();
    expect((await api(teacher, "GET", `/api/manage/courses/${course.id}`)).body.course.joinCode).toBeNull();
    const on = await api(teacher, "POST", `/api/manage/courses/${course.id}/join-code`);
    expect(on.body.joinCode).toHaveLength(8);
  });
});

async function courseWithLesson(teacher: Client, lessonOverrides: Record<string, unknown> = {}) {
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, {
    title: "Modul 1",
    status: "published",
  });
  const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, {
    title: "Pengenalan",
    content: "Isi \\(x^2 + y^2 = r^2\\) dan **tebal**.",
    status: "published",
    ...lessonOverrides,
  });
  expect(lesson.status).toBe(201);
  return { course, moduleId: module.body.id as string, lessonId: lesson.body.id as string };
}

describe("modules and lessons reach students only when published", () => {
  test("drafts are hidden; publishing reveals them; the content survives byte for byte", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    await joinCourse(student, course.joinCode);

    const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: "Draf" });
    expect(module.status).toBe(201);
    const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, {
      title: "Pelajaran",
      content: "Rumus \\(\\int_0^1 x\\,dx = \\tfrac12\\)",
    });

    const hidden = await api(student, "GET", `/api/student/courses/${course.id}`);
    expect(hidden.body.modules).toEqual([]);
    expect((await api(student, "GET", `/api/student/lessons/${lesson.body.id}`)).status).toBe(404);

    await api(teacher, "PATCH", `/api/manage/modules/${module.body.id}`, { status: "published" });
    // a published module with a draft lesson still hides the lesson
    const half = await api(student, "GET", `/api/student/courses/${course.id}`);
    expect(half.body.modules).toHaveLength(1);
    expect(half.body.modules[0].lessons).toEqual([]);

    await api(teacher, "PATCH", `/api/manage/lessons/${lesson.body.id}`, { status: "published" });
    const shown = await api(student, "GET", `/api/student/lessons/${lesson.body.id}`);
    expect(shown.status).toBe(200);
    expect(shown.body.content).toBe("Rumus \\(\\int_0^1 x\\,dx = \\tfrac12\\)");
  });

  test("deleting archives: student progress survives an archive/restore round trip", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);

    const marked = await api(student, "PATCH", `/api/student/lessons/${lessonId}/progress`, { status: "completed" });
    expect(marked.status).toBe(200);
    expect((await api(student, "PATCH", `/api/student/lessons/${lessonId}/progress`, { status: "in_progress" })).status).toBe(200);
    expect((await api(student, "PATCH", `/api/student/lessons/${lessonId}/progress`, { status: "completed" })).status).toBe(200);
    expect((await api(teacher, "DELETE", `/api/manage/lessons/${lessonId}`)).status).toBe(200);
    expect((await api(student, "GET", `/api/student/lessons/${lessonId}`)).status).toBe(404);

    await api(teacher, "PATCH", `/api/manage/lessons/${lessonId}`, { status: "published" });
    const back = await api(student, "GET", `/api/student/lessons/${lessonId}`);
    expect(back.status).toBe(200);
    expect(back.body.progressStatus).toBe("completed");
  });

  test("archived modules disappear from the student's course but stay in the teacher's editor", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, moduleId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);

    await api(teacher, "DELETE", `/api/manage/modules/${moduleId}`);
    expect((await api(student, "GET", `/api/student/courses/${course.id}`)).body.modules).toEqual([]);
    const editor = await api(teacher, "GET", `/api/manage/courses/${course.id}`);
    expect(editor.body.modules.map((m: any) => [m.id, m.status])).toEqual([[moduleId, "archived"]]);
  });

  test("text validation", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: "M" });
    const lessons = `/api/manage/modules/${module.body.id}/lessons`;
    expect((await api(teacher, "POST", lessons, { title: "" })).status).toBe(400);
    expect((await api(teacher, "POST", lessons, { title: "x".repeat(161) })).status).toBe(400);
    expect((await api(teacher, "POST", lessons, { title: "ok", content: "x".repeat(50_001) })).status).toBe(400);
    expect((await api(teacher, "POST", lessons, { title: "ok", status: "live" })).status).toBe(400);
    expect((await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: "x".repeat(121) })).status).toBe(400);
  });
});

describe("resources", () => {
  const resourcesOf = (lessonId: string) => `/api/manage/lessons/${lessonId}/resources`;

  test("a PDF link is a normal 'file' resource and reaches the student with its URL intact", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);

    const url = "https://cdn.example.org/materi/bab-1.pdf?versi=2";
    const created = await api(teacher, "POST", resourcesOf(lessonId), {
      type: "file",
      title: "Modul PDF Bab 1",
      content: "Baca halaman 3–10.",
      url,
    });
    expect(created.status).toBe(201);

    const lesson = await api(student, "GET", `/api/student/lessons/${lessonId}`);
    expect(lesson.body.resources).toHaveLength(1);
    expect(lesson.body.resources[0]).toMatchObject({
      type: "file",
      title: "Modul PDF Bab 1",
      content: "Baca halaman 3–10.",
      url,
    });
  });

  test("only http(s) URLs are stored: javascript:, data:, file: and friends are refused", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const hostile = [
      "javascript:alert(document.cookie)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\nscript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "ftp://example.com/x.pdf",
      "vbscript:msgbox(1)",
      "//example.com/x.pdf",
      "example.com/x.pdf",
      "",
    ];
    for (const type of ["link", "file"]) {
      for (const url of hostile) {
        const reply = await api(teacher, "POST", resourcesOf(lessonId), { type, title: "X", url });
        expect({ type, url, status: reply.status }).toEqual({ type, url, status: 400 });
      }
    }
    // And nothing slipped in.
    const lesson = (await api(teacher, "GET", `/api/manage/lessons/${lessonId}`)); // no such route: 404 is fine
    expect(lesson.status).toBe(404);
    const editor = await api(teacher, "GET", `/api/manage/courses/${(await api(teacher, "GET", "/api/manage/courses")).body.courses[0].id}`);
    expect(editor.body.modules[0].lessons[0].resources).toEqual([]);
  });

  test("an update cannot sneak a hostile URL in either", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const created = await api(teacher, "POST", resourcesOf(lessonId), { type: "link", title: "Aman", url: "https://example.com/" });
    const bad = await api(teacher, "PATCH", `/api/manage/resources/${created.body.id}`, {
      type: "link",
      title: "Aman",
      url: "javascript:alert(1)",
    });
    expect(bad.status).toBe(400);
  });

  test("shape rules per type", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const post = (body: unknown) => api(teacher, "POST", resourcesOf(lessonId), body);

    expect((await post({ type: "text", title: "T" })).status).toBe(400); // text needs content
    expect((await post({ type: "link", title: "T" })).status).toBe(400); // link needs url
    expect((await post({ type: "podcast", title: "T", url: "https://a.b" })).status).toBe(400);
    expect((await post({ type: "text", title: "", content: "x" })).status).toBe(400);

    // a text resource never carries a URL, even if one is sent
    const text = await post({ type: "text", title: "Ringkasan", content: "Isi", url: "https://example.com" });
    expect(text.status).toBe(201);
    const editor = await api(teacher, "GET", `/api/manage/courses/${(await api(teacher, "GET", "/api/manage/courses")).body.courses[0].id}`);
    expect(editor.body.modules[0].lessons[0].resources[0]).toMatchObject({ type: "text", url: null, content: "Isi" });
  });

  test("a resource can change type and be removed for real", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);

    const created = await api(teacher, "POST", resourcesOf(lessonId), { type: "text", title: "Catatan", content: "Awal" });
    const changed = await api(teacher, "PATCH", `/api/manage/resources/${created.body.id}`, {
      type: "file",
      title: "Catatan PDF",
      url: "https://example.com/catatan.pdf",
    });
    expect(changed.status).toBe(200);
    expect((await api(student, "GET", `/api/student/lessons/${lessonId}`)).body.resources[0]).toMatchObject({
      type: "file",
      content: null,
    });

    expect((await api(teacher, "DELETE", `/api/manage/resources/${created.body.id}`)).status).toBe(200);
    expect((await api(student, "GET", `/api/student/lessons/${lessonId}`)).body.resources).toEqual([]);
  });

  test("a lesson holds at most 50 resources", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    for (let index = 0; index < 50; index += 1) {
      const reply = await api(teacher, "POST", resourcesOf(lessonId), { type: "text", title: `R${index}`, content: "x" });
      expect(reply.status).toBe(201);
    }
    const over = await api(teacher, "POST", resourcesOf(lessonId), { type: "text", title: "R50", content: "x" });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LIMIT_REACHED");
  });
});

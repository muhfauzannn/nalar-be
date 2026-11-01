import { describe, expect, test } from "bun:test";

import { api, joinCourse, makeCourse, newUser, publishCourse, type Client } from "./helpers";

async function courseWithLesson(teacher: Client) {
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, {
    title: "Dinamika",
    status: "published",
  });
  const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, {
    title: "Gaya pada bidang miring",
    content: "Komponen gaya berat sejajar bidang adalah mg sin θ.",
    status: "published",
  });
  expect(lesson.status).toBe(201);
  return { course, lessonId: lesson.body.id as string };
}

async function setup() {
  const teacher = await newUser("guru");
  const { course, lessonId } = await courseWithLesson(teacher);
  const attached = await api(teacher, "POST", `/api/manage/lessons/${lessonId}/labs`, { labKey: "bidang-miring" });
  expect(attached.status).toBe(201);
  const labId = attached.body.labs[0].id as string;
  const student = await newUser("siswa");
  expect((await joinCourse(student, course.joinCode)).status).toBe(200);
  return { teacher, student, course, lessonId, labId };
}

describe("labs on lessons", () => {
  test("a teacher attaches a lab from the catalog, once, and sees it in the editor", async () => {
    const teacher = await newUser("guru");
    const { lessonId } = await courseWithLesson(teacher);
    const catalog = await api(teacher, "GET", "/api/manage/labs");
    expect(catalog.body.labs.map((lab: { key: string }) => lab.key)).toContain("bidang-miring");

    expect((await api(teacher, "POST", `/api/manage/lessons/${lessonId}/labs`, { labKey: "tidak-ada" })).status).toBe(400);
    await api(teacher, "POST", `/api/manage/lessons/${lessonId}/labs`, { labKey: "bidang-miring" });
    const again = await api(teacher, "POST", `/api/manage/lessons/${lessonId}/labs`, { labKey: "bidang-miring" });
    expect(again.body.labs).toHaveLength(1);

    const editor = await api(teacher, "GET", `/api/manage/lessons/${lessonId}`);
    expect(editor.body.labs).toEqual([{ id: again.body.labs[0].id, labKey: "bidang-miring" }]);
    expect(editor.body.labCatalog.length).toBeGreaterThan(0);

    const stranger = await newUser("orang-lain");
    expect((await api(stranger, "POST", `/api/manage/lessons/${lessonId}/labs`, { labKey: "bidang-miring" })).status).toBe(404);
  });

  test("a student solves a challenge once for 5 points, and it shows on the lesson and the island", async () => {
    const { student, course, lessonId, labId } = await setup();
    const path = (challenge: string) => `/api/student/labs/${labId}/challenges/${challenge}`;

    expect((await api(student, "POST", path("mulai-meluncur"))).body).toEqual({ points: 5 });
    expect((await api(student, "POST", path("mulai-meluncur"))).body).toEqual({ points: 0 });
    expect((await api(student, "POST", path("bukan-tantangan"))).status).toBe(400);

    const lesson = await api(student, "GET", `/api/student/lessons/${lessonId}`);
    expect(lesson.body.labs).toEqual([{ id: labId, labKey: "bidang-miring", solved: ["mulai-meluncur"] }]);

    const island = await api(student, "GET", `/api/student/courses/${course.id}/island`);
    expect(island.body.points.total).toBe(5);
    expect(island.body.labs[0]).toMatchObject({ id: labId, lessonId, solved: 1, challenges: 3 });
    expect((await api(student, "GET", "/api/student/points")).body.total).toBe(5);
  });

  test("only the course's students can solve it, and a used lab cannot be detached", async () => {
    const { teacher, student, labId } = await setup();
    const outsider = await newUser("luar");
    expect((await api(outsider, "POST", `/api/student/labs/${labId}/challenges/mulai-meluncur`)).status).toBe(404);

    await api(student, "POST", `/api/student/labs/${labId}/challenges/pilih-permukaan`);
    const detach = await api(teacher, "DELETE", `/api/manage/labs/${labId}`);
    expect(detach.status).toBe(409);
    expect(detach.body.code).toBe("LAB_IN_USE");
  });

  test("an unused lab can be detached", async () => {
    const { teacher, labId } = await setup();
    expect((await api(teacher, "DELETE", `/api/manage/labs/${labId}`)).body).toEqual({ deleted: true });
  });
});

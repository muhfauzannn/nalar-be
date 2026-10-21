import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../src/database/client";
import {
  api,
  joinCourse,
  makeCourse,
  multipleChoice,
  newUser,
  publishCourse,
  type Client,
} from "./helpers";

async function modules(teacher: Client, courseId: string) {
  const editor = await api(teacher, "GET", `/api/manage/courses/${courseId}`);
  return editor.body.modules as Array<{ id: string; title: string; position: number }>;
}

async function addModules(teacher: Client, courseId: string, titles: string[]) {
  const ids: string[] = [];
  for (const title of titles) {
    const reply = await api(teacher, "POST", `/api/manage/courses/${courseId}/modules`, { title });
    expect(reply.status).toBe(201);
    ids.push(reply.body.id);
  }
  return ids;
}

describe("ordering siblings under UNIQUE (parent, position)", () => {
  test("new items are appended in creation order", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    await addModules(teacher, course.id, ["A", "B", "C"]);
    const list = await modules(teacher, course.id);
    expect(list.map((m) => [m.title, m.position])).toEqual([["A", 1], ["B", 2], ["C", 3]]);
  });

  test("swapping two neighbours works even though a row-by-row update would collide", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const [a, b, c] = await addModules(teacher, course.id, ["A", "B", "C"]);

    const swap = await api(teacher, "PUT", `/api/manage/courses/${course.id}/modules/order`, { ids: [b, a, c] });
    expect(swap.status).toBe(200);
    expect((await modules(teacher, course.id)).map((m) => [m.title, m.position])).toEqual([["B", 1], ["A", 2], ["C", 3]]);
  });

  test("arbitrary permutations always end up numbered 1..n", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const ids = await addModules(teacher, course.id, ["A", "B", "C", "D", "E", "F"]);
    const titleOf = new Map(ids.map((id, index) => ["ABCDEF"[index]!, id]));
    const permutations = ["FEDCBA", "ABCDEF", "DABCFE", "BCDEFA", "AFBECD"];
    for (const permutation of permutations) {
      const order = [...permutation].map((letter) => titleOf.get(letter)!);
      expect((await api(teacher, "PUT", `/api/manage/courses/${course.id}/modules/order`, { ids: order })).status).toBe(200);
      const list = await modules(teacher, course.id);
      expect(list.map((m) => m.title).join("")).toBe(permutation);
      expect(list.map((m) => m.position)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  test("an order list that does not match the current children is refused untouched", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const [a, b, c] = await addModules(teacher, course.id, ["A", "B", "C"]);
    const put = (ids: unknown) => api(teacher, "PUT", `/api/manage/courses/${course.id}/modules/order`, { ids });

    for (const ids of [[a, b], [a, b, c, crypto.randomUUID()], [a, b, crypto.randomUUID()]]) {
      const reply = await put(ids);
      expect({ status: reply.status, code: reply.body.code }).toEqual({ status: 409, code: "ORDER_MISMATCH" });
    }
    for (const ids of [[], [a, a, b], "x", [1, 2, 3]]) {
      expect((await put(ids)).status).toBe(400);
    }
    expect((await modules(teacher, course.id)).map((m) => m.title)).toEqual(["A", "B", "C"]);
  });

  test("lessons, resources and quiz questions reorder the same way", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const [moduleId] = await addModules(teacher, course.id, ["M"]);

    const lessonIds: string[] = [];
    for (const title of ["L1", "L2", "L3"]) {
      lessonIds.push((await api(teacher, "POST", `/api/manage/modules/${moduleId}/lessons`, { title })).body.id);
    }
    expect((await api(teacher, "PUT", `/api/manage/modules/${moduleId}/lessons/order`, { ids: [...lessonIds].reverse() })).status).toBe(200);

    const resourceIds: string[] = [];
    for (const title of ["R1", "R2"]) {
      resourceIds.push((await api(teacher, "POST", `/api/manage/lessons/${lessonIds[0]}/resources`, { type: "text", title, content: "x" })).body.id);
    }
    expect((await api(teacher, "PUT", `/api/manage/lessons/${lessonIds[0]}/resources/order`, { ids: [...resourceIds].reverse() })).status).toBe(200);

    const quiz = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, { title: "Q" });
    const questionIds: string[] = [];
    for (const prompt of ["Q1", "Q2", "Q3"]) {
      questionIds.push((await api(teacher, "POST", `/api/manage/quizzes/${quiz.body.id}/questions`, multipleChoice({ prompt }))).body.id);
    }
    expect((await api(teacher, "PUT", `/api/manage/quizzes/${quiz.body.id}/questions/order`, { ids: [questionIds[2], questionIds[0], questionIds[1]] })).status).toBe(200);

    const editor = await api(teacher, "GET", `/api/manage/courses/${course.id}`);
    expect(editor.body.modules[0].lessons.map((l: any) => l.title)).toEqual(["L3", "L2", "L1"]);
    const reordered = editor.body.modules[0].lessons.find((l: any) => l.title === "L1");
    expect(reordered.resources.map((r: any) => r.title)).toEqual(["R2", "R1"]);
    const quizEditor = await api(teacher, "GET", `/api/manage/quizzes/${quiz.body.id}`);
    expect(quizEditor.body.questions.map((q: any) => [q.prompt, q.position])).toEqual([["Q3", 1], ["Q1", 2], ["Q2", 3]]);
  });

  test("the student sees the teacher's order", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    await joinCourse(student, course.joinCode);
    const ids: string[] = [];
    for (const title of ["Satu", "Dua", "Tiga"]) {
      ids.push((await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title, status: "published" })).body.id);
    }
    await api(teacher, "PUT", `/api/manage/courses/${course.id}/modules/order`, { ids: [ids[2], ids[0], ids[1]] });
    const view = await api(student, "GET", `/api/student/courses/${course.id}`);
    expect(view.body.modules.map((m: any) => m.title)).toEqual(["Tiga", "Satu", "Dua"]);
  });

  test("ten simultaneous creations get ten distinct positions and no request fails", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const replies = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: `P${index}` }),
      ),
    );
    expect(replies.map((reply) => reply.status)).toEqual(Array(10).fill(201));
    const list = await modules(teacher, course.id);
    expect(list.map((m) => m.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("archiving leaves a gap; the next item still lands after the last one", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const [, b] = await addModules(teacher, course.id, ["A", "B", "C"]);
    await api(teacher, "DELETE", `/api/manage/modules/${b}`);
    await addModules(teacher, course.id, ["D"]);
    const list = await modules(teacher, course.id);
    expect(list.map((m) => [m.title, m.position])).toEqual([["A", 1], ["B", 2], ["C", 3], ["D", 4]]);
  });

  test("when positions drift very high they are compacted instead of overflowing smallint", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const quiz = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, { title: "Q" });
    const quizId = quiz.body.id as string;
    for (const prompt of ["Q1", "Q2", "Q3"]) {
      await api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, multipleChoice({ prompt }));
    }
    // quiz_question.position is smallint; simulate years of add/delete churn.
    await db.execute(sql`update quiz_question set position = position + 5000 where quiz_id = ${quizId}`);

    const added = await api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, multipleChoice({ prompt: "Q4" }));
    expect(added.status).toBe(201);
    const editor = await api(teacher, "GET", `/api/manage/quizzes/${quizId}`);
    expect(editor.body.questions.map((q: any) => [q.prompt, q.position])).toEqual([
      ["Q1", 1], ["Q2", 2], ["Q3", 3], ["Q4", 4],
    ]);

    // and reordering a high-numbered group works too
    await db.execute(sql`update quiz_question set position = position + 9000 where quiz_id = ${quizId}`);
    const ids = editor.body.questions.map((q: any) => q.id).reverse();
    const reply = await api(teacher, "PUT", `/api/manage/quizzes/${quizId}/questions/order`, { ids });
    expect(reply.status).toBe(200);
  });
});

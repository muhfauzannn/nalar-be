import { describe, expect, test } from "bun:test";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../src/database/client";
import {
  assignment,
  courseMembership,
  rubric,
  rubricCriterion,
  scenario,
  submission,
} from "../src/database/schema";
import {
  api,
  joinCourse,
  makeCourse,
  makeScenario,
  newUser,
  publishCourse,
  type Client,
} from "./helpers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const threeCriteria = [
  { label: "Representasi", description: "Masalah dinyatakan tepat.", maxPoints: 30 },
  { label: "Strategi", description: "Langkah logis dan efisien.", maxPoints: 40 },
  { label: "Refleksi", description: "Hasil diperiksa kembali.", maxPoints: 30 },
];

async function setup() {
  const teacher = await newUser("teacher");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const scn = await makeScenario();
  const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, {
    scenarioId: scn.id,
  });
  expect(created.status).toBe(201);
  return { teacher, course, scn, assignmentId: created.body.id as string };
}

const publish = (teacher: Client, id: string) =>
  api(teacher, "PATCH", `/api/manage/assignments/${id}`, { status: "published" });

async function enrolledStudent(teacher: Client, courseId: string) {
  const student = await newUser("student");
  const code = (await api(teacher, "GET", `/api/manage/courses/${courseId}`)).body.course.joinCode;
  expect((await joinCourse(student, code)).status).toBe(200);
  return student;
}

describe("creating an assignment from a scenario", () => {
  test("starts as a draft with the scenario's text and a private copy of its rubric", async () => {
    const { teacher, scn, assignmentId } = await setup();

    const editor = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}`);
    expect(editor.status).toBe(200);
    expect(editor.body.assignment).toMatchObject({
      status: "draft",
      title: "Scenario uji",
      instructions: "Selesaikan masalah berikut dengan alasan.",
      scenarioTitle: "Scenario uji",
    });
    expect(editor.body.criteria.map((c: any) => [c.label, c.maxPoints])).toEqual([
      ["Penalaran", 60],
      ["Ketepatan", 40],
    ]);
    expect(editor.body.editable).toBe(true);

    const [row] = await db.select().from(assignment).where(eq(assignment.id, assignmentId));
    expect(row!.rubricId).not.toBe(scn.defaultRubricId);
    const [copy] = await db.select().from(rubric).where(eq(rubric.id, row!.rubricId));
    expect(copy).toMatchObject({ isTemplate: false, sourceRubricId: scn.defaultRubricId });
  });

  test("custom title and instructions override the scenario's", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const scn = await makeScenario();
    const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, {
      scenarioId: scn.id,
      title: "Tugas Minggu 3",
      instructions: "Kerjakan nomor 1–3.",
    });
    const editor = await api(teacher, "GET", `/api/manage/assignments/${created.body.id}`);
    expect(editor.body.assignment).toMatchObject({
      title: "Tugas Minggu 3",
      instructions: "Kerjakan nomor 1–3.",
    });
  });

  test("an unknown or deactivated scenario is rejected", async () => {
    const { teacher, course, scn } = await setup();
    const unknown = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, {
      scenarioId: crypto.randomUUID(),
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("SCENARIO_NOT_FOUND");

    await db.update(scenario).set({ isActive: false }).where(eq(scenario.id, scn.id));
    const inactive = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, {
      scenarioId: scn.id,
    });
    expect(inactive.body.code).toBe("SCENARIO_NOT_FOUND");
  });

  test("the scenario picker lists active scenarios with their rubric", async () => {
    const { teacher, scn } = await setup();
    const list = await api(teacher, "GET", "/api/manage/scenarios");
    const entry = list.body.scenarios.find((s: any) => s.id === scn.id);
    expect(entry.criteria.map((c: any) => c.label)).toEqual(["Penalaran", "Ketepatan"]);
    expect(entry.subjectName).toBeString();
  });

  test("schedule and module are validated", async () => {
    const { teacher, course, scn, assignmentId } = await setup();
    const reversed = await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, {
      dueAt: "2030-02-01T00:00:00Z",
      closesAt: "2030-01-01T00:00:00Z",
    });
    expect(reversed.status).toBe(400);
    expect(reversed.body.code).toBe("INVALID_SCHEDULE");

    const otherTeacher = await newUser("other");
    const otherCourse = await makeCourse(otherTeacher);
    const foreignModule = await api(otherTeacher, "POST", `/api/manage/courses/${otherCourse.id}/modules`, { title: "Asing" });
    const wrong = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, {
      scenarioId: scn.id,
      moduleId: foreignModule.body.id,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("MODULE_NOT_IN_COURSE");
  });
});

describe("rubric editing", () => {
  test("replacing criteria changes this assignment only - never the template or later copies", async () => {
    const { teacher, course, scn, assignmentId } = await setup();

    const replaced = await api(teacher, "PUT", `/api/manage/assignments/${assignmentId}/criteria`, {
      criteria: threeCriteria,
    });
    expect(replaced.status).toBe(200);
    const editor = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}`);
    expect(editor.body.criteria.map((c: any) => c.label)).toEqual(["Representasi", "Strategi", "Refleksi"]);
    expect(editor.body.criteria.map((c: any) => c.position)).toEqual([1, 2, 3]);

    const template = await db
      .select({ label: rubricCriterion.label })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.rubricId, scn.defaultRubricId))
      .orderBy(asc(rubricCriterion.position));
    expect(template.map((c) => c.label)).toEqual(["Penalaran", "Ketepatan"]);

    const second = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, { scenarioId: scn.id });
    const secondEditor = await api(teacher, "GET", `/api/manage/assignments/${second.body.id}`);
    expect(secondEditor.body.criteria.map((c: any) => c.label)).toEqual(["Penalaran", "Ketepatan"]);
  });

  test("invalid criteria are rejected", async () => {
    const { teacher, assignmentId } = await setup();
    const put = (criteria: unknown) =>
      api(teacher, "PUT", `/api/manage/assignments/${assignmentId}/criteria`, { criteria });
    expect((await put([{ label: "A", description: "B", maxPoints: 0 }])).status).toBe(400);
    expect((await put([{ label: "A", description: "B", maxPoints: 101 }])).status).toBe(400);
    expect((await put([{ label: "", description: "B", maxPoints: 10 }])).status).toBe(400);
    expect((await put([{ label: "A", description: "", maxPoints: 10 }])).status).toBe(400);
    expect((await put(Array.from({ length: 21 }, (_, i) => ({ label: `K${i}`, description: "d", maxPoints: 1 })))).status).toBe(400);
    expect((await put("bukan array")).status).toBe(400);
    // the rubric survived all of that
    const editor = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}`);
    expect(editor.body.criteria).toHaveLength(2);
  });

  test("publishing needs at least one criterion", async () => {
    const { teacher, assignmentId } = await setup();
    await api(teacher, "PUT", `/api/manage/assignments/${assignmentId}/criteria`, { criteria: [] });
    const blocked = await publish(teacher, assignmentId);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("ASSIGNMENT_NOT_READY");

    await api(teacher, "PUT", `/api/manage/assignments/${assignmentId}/criteria`, { criteria: threeCriteria });
    expect((await publish(teacher, assignmentId)).status).toBe(200);
  });

  test("a published assignment must return to draft before instructions or rubric change", async () => {
    const { teacher, assignmentId } = await setup();
    await publish(teacher, assignmentId);

    const text = await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { instructions: "Diganti diam-diam" });
    expect(text.status).toBe(409);
    expect(text.body.code).toBe("ASSIGNMENT_NOT_DRAFT");
    const rubricEdit = await api(teacher, "PUT", `/api/manage/assignments/${assignmentId}/criteria`, { criteria: threeCriteria });
    expect(rubricEdit.body.code).toBe("ASSIGNMENT_NOT_DRAFT");

    // Re-sending the same text is not an edit.
    const same = await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, {
      instructions: "Selesaikan masalah berikut dengan alasan.",
    });
    expect(same.status).toBe(200);

    expect((await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { status: "draft" })).status).toBe(200);
    expect((await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { instructions: "Versi baru" })).status).toBe(200);
  });
});

describe("a student works on an authored assignment", () => {
  async function started() {
    const ctx = await setup();
    await api(ctx.teacher, "PUT", `/api/manage/assignments/${ctx.assignmentId}/criteria`, { criteria: threeCriteria });
    expect((await publish(ctx.teacher, ctx.assignmentId)).status).toBe(200);
    const student = await enrolledStudent(ctx.teacher, ctx.course.id);
    const view = await api(student, "GET", `/api/student/assignments/${ctx.assignmentId}`);
    expect(view.status).toBe(200);
    const begin = await api(student, "POST", `/api/student/assignments/${ctx.assignmentId}/submissions`, {});
    expect(begin.status).toBe(201);
    return { ...ctx, student, view, submissionId: begin.body.id as string };
  }

  test("the student sees the authored text and rubric; a draft stays hidden", async () => {
    const ctx = await setup();
    const student = await enrolledStudent(ctx.teacher, ctx.course.id);
    expect((await api(student, "GET", `/api/student/assignments/${ctx.assignmentId}`)).status).toBe(404);

    await api(ctx.teacher, "PUT", `/api/manage/assignments/${ctx.assignmentId}/criteria`, { criteria: threeCriteria });
    await publish(ctx.teacher, ctx.assignmentId);
    const view = await api(student, "GET", `/api/student/assignments/${ctx.assignmentId}`);
    expect(view.status).toBe(200);
    expect(view.body.instructions).toBe("Selesaikan masalah berikut dengan alasan.");
    expect(view.body.criteria.map((c: any) => c.label)).toEqual(["Representasi", "Strategi", "Refleksi"]);
    expect(view.body.canStart).toBe(true);
  });

  test("once a submission exists, instructions and rubric are frozen but title and schedule are not", async () => {
    const { teacher, assignmentId } = await started();

    const text = await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { instructions: "Diganti setelah dikerjakan" });
    expect(text.status).toBe(409);
    expect(text.body.code).toBe("ASSIGNMENT_LOCKED");
    const rubricEdit = await api(teacher, "PUT", `/api/manage/assignments/${assignmentId}/criteria`, { criteria: threeCriteria.slice(0, 1) });
    expect(rubricEdit.body.code).toBe("ASSIGNMENT_LOCKED");
    const revert = await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { status: "draft" });
    expect(revert.status).toBe(409);
    expect(revert.body.code).toBe("INVALID_TRANSITION");

    const editor = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}`);
    expect(editor.body).toMatchObject({ locked: true, editable: false, submissionCount: 1 });
    expect(editor.body.criteria).toHaveLength(3);

    const meta = await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, {
      title: "Judul diperbarui",
      dueAt: "2032-05-05T00:00:00Z",
    });
    expect(meta.status).toBe(200);
  });

  test("archiving hides the assignment from the student but keeps their work", async () => {
    const { teacher, assignmentId, student, submissionId } = await started();
    expect((await api(teacher, "DELETE", `/api/manage/assignments/${assignmentId}`)).status).toBe(200);
    expect((await api(student, "GET", `/api/student/assignments/${assignmentId}`)).status).toBe(404);
    const rows = await db.select({ id: submission.id }).from(submission).where(eq(submission.id, submissionId));
    expect(rows).toHaveLength(1);
  });

  test("duplicating gives an editable copy with its own rubric", async () => {
    const { teacher, assignmentId } = await started();
    const copy = await api(teacher, "POST", `/api/manage/assignments/${assignmentId}/duplicate`);
    expect(copy.status).toBe(201);

    const copyEditor = await api(teacher, "GET", `/api/manage/assignments/${copy.body.id}`);
    expect(copyEditor.body.assignment.status).toBe("draft");
    expect(copyEditor.body.assignment.title).toEndWith("(salinan)");
    expect(copyEditor.body.editable).toBe(true);
    expect(copyEditor.body.criteria).toHaveLength(3);

    await api(teacher, "PUT", `/api/manage/assignments/${copy.body.id}/criteria`, { criteria: threeCriteria.slice(0, 1) });
    const original = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}`);
    expect(original.body.criteria).toHaveLength(3);

    const rows = await db
      .select({ rubricId: assignment.rubricId })
      .from(assignment)
      .where(eq(assignment.courseId, copyEditor.body.assignment.courseId));
    expect(new Set(rows.map((row) => row.rubricId)).size).toBe(rows.length);
  });

  test("a submission that is mid-insert makes a concurrent rubric edit wait, then refuse", async () => {
    const ctx = await setup();
    const student = await enrolledStudent(ctx.teacher, ctx.course.id);
    const [membership] = await db
      .select({ id: courseMembership.id })
      .from(courseMembership)
      .where(and(eq(courseMembership.courseId, ctx.course.id), eq(courseMembership.userId, student.id)));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const insertTx = db.transaction(async (tx) => {
      await tx.insert(submission).values({
        assignmentId: ctx.assignmentId,
        studentCourseMembershipId: membership!.id,
      });
      await gate;
    });
    await sleep(150);

    const edit = api(ctx.teacher, "PUT", `/api/manage/assignments/${ctx.assignmentId}/criteria`, { criteria: threeCriteria });
    const outcome = await Promise.race([edit.then(() => "finished"), sleep(500).then(() => "blocked")]);
    expect(outcome).toBe("blocked");

    release();
    await insertTx;
    const reply = await edit;
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe("ASSIGNMENT_LOCKED");
  });
});

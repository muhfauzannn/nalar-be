import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import { db } from "../src/database/client";
import {
  courseMembership,
  explanationFactor,
  offloadingIndexResult,
  promptClassification,
  stageArtifact,
  stageProgress,
  submission,
  tutorConversation,
  tutorMessage,
  writingSignal,
} from "../src/database/schema";
import { api, joinCourse, makeCourse, makeScenario, newUser, publishCourse, type Client } from "./helpers";

const STAGES = [
  "1_independent_effort",
  "2_guided_questioning",
  "3_ai_evaluation",
  "4_revision_finalization",
  "5_reflection",
] as const;

async function newAssignment(teacher: Client, courseId: string, scenarioId: string) {
  const created = await api(teacher, "POST", `/api/manage/courses/${courseId}/assignments`, { scenarioId });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

async function student(teacher: Client, courseId: string, label: string) {
  const client = await newUser(label);
  const code = (await api(teacher, "GET", `/api/manage/courses/${courseId}`)).body.course.joinCode;
  expect((await joinCourse(client, code)).status).toBe(200);
  const [membership] = await db
    .select({ id: courseMembership.id })
    .from(courseMembership)
    .where(and(eq(courseMembership.courseId, courseId), eq(courseMembership.userId, client.id)));
  return { client, membershipId: membership!.id };
}

// The learning log a finished submission leaves behind, written straight to the DB.
async function finishedSubmission(
  assignmentId: string,
  membershipId: string,
  options: {
    attempt?: number;
    status?: "in_progress" | "submitted";
    stagesDone?: number;
    result?: { level: "1_ai_as_tool" | "2_ai_as_scaffold" | "3_partial_offloading" | "4_full_offloading"; score: number; computedAt: Date };
    factors?: Array<{ factor: string; contribution: number }>;
    prompts?: Array<{ content: string; intent: "direct_answer" | "explanation_hint" | "reflective_evaluative"; redirected?: boolean }>;
  } = {},
) {
  const status = options.status ?? "submitted";
  const stagesDone = options.stagesDone ?? (status === "submitted" ? 5 : 1);
  const [sub] = await db
    .insert(submission)
    .values({
      assignmentId,
      studentCourseMembershipId: membershipId,
      attemptNumber: options.attempt ?? 1,
      status,
      currentStage: STAGES[Math.min(stagesDone, 4)],
      startedAt: new Date("2026-10-01T08:00:00Z"),
      submittedAt: status === "submitted" ? options.result?.computedAt ?? new Date("2026-10-01T09:00:00Z") : null,
    })
    .returning({ id: submission.id });
  const id = sub!.id;
  await db.insert(stageProgress).values(
    STAGES.map((stage, index) => ({
      submissionId: id,
      stage,
      status: index < stagesDone ? ("completed" as const) : index === stagesDone ? ("in_progress" as const) : ("locked" as const),
    })),
  );
  await db.insert(stageArtifact).values([
    { submissionId: id, stage: "1_independent_effort", content: "Draf awal versi 1", version: 1 },
    { submissionId: id, stage: "1_independent_effort", content: "Draf awal final", version: 2, isFinal: true },
    { submissionId: id, stage: "4_revision_finalization", content: "Jawaban akhir", version: 1, isFinal: true },
  ]);
  if (options.prompts?.length) {
    const [conversation] = await db.insert(tutorConversation).values({ submissionId: id }).returning({ id: tutorConversation.id });
    let sequence = 1;
    for (const prompt of options.prompts) {
      const [message] = await db
        .insert(tutorMessage)
        .values({ conversationId: conversation!.id, clientEventId: crypto.randomUUID(), author: "student", content: prompt.content, mode: "hint", wasRedirected: prompt.redirected ?? false, sequence: sequence++ })
        .returning({ id: tutorMessage.id });
      await db.insert(promptClassification).values({ messageId: message!.id, intent: prompt.intent, confidence: "0.900", classifierVersion: "test" });
      await db.insert(tutorMessage).values({ conversationId: conversation!.id, clientEventId: crypto.randomUUID(), author: "tutor", content: "Coba pikirkan lagi.", mode: "hint", modelVersion: "test", sequence: sequence++ });
    }
  }
  if (options.result) {
    const [result] = await db
      .insert(offloadingIndexResult)
      .values({
        submissionId: id,
        level: options.result.level,
        score: options.result.score.toFixed(2),
        intentInput: "50.00",
        effortInput: "50.00",
        studentReport: "Laporan reflektif.",
        recommendations: ["Tulis draf awal lebih lengkap."],
        scoringVersion: "test",
        computedAt: options.result.computedAt,
      })
      .returning({ id: offloadingIndexResult.id });
    if (options.factors?.length) {
      await db.insert(explanationFactor).values(
        options.factors.map((factor) => ({
          resultId: result!.id,
          factor: factor.factor,
          contribution: factor.contribution.toFixed(2),
          plainExplanation: `Penjelasan ${factor.factor}`,
        })),
      );
    }
  }
  return id;
}

async function setup() {
  const teacher = await newUser("teacher");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const scn = await makeScenario();
  const assignmentId = await newAssignment(teacher, course.id, scn.id);
  return { teacher, courseId: course.id as string, scenarioId: scn.id, assignmentId };
}

describe("teacher analytics for one assignment", () => {
  test("only the course's teacher can read it", async () => {
    const { teacher, courseId, assignmentId } = await setup();
    const learner = await student(teacher, courseId, "siswa");
    const subId = await finishedSubmission(assignmentId, learner.membershipId);
    const stranger = await newUser("stranger");

    for (const client of [learner.client, stranger]) {
      expect((await api(client, "GET", `/api/manage/assignments/${assignmentId}/analytics`)).status).toBe(404);
      expect((await api(client, "GET", `/api/manage/assignments/${assignmentId}/submissions/${subId}`)).status).toBe(404);
    }
    expect((await api(null, "GET", `/api/manage/assignments/${assignmentId}/analytics`)).status).toBe(401);
  });

  test("shows every enrolled student, the level spread and the factors that recur", async () => {
    const { teacher, courseId, scenarioId, assignmentId } = await setup();
    const earlierAssignment = await newAssignment(teacher, courseId, scenarioId);
    const ani = await student(teacher, courseId, "Ani");
    const budi = await student(teacher, courseId, "Budi");
    const citra = await student(teacher, courseId, "Citra");
    await student(teacher, courseId, "Dodi");

    // Ani: an earlier result in the same course, then this one.
    await finishedSubmission(earlierAssignment, ani.membershipId, {
      result: { level: "2_ai_as_scaffold", score: 40, computedAt: new Date("2026-09-01T10:00:00Z") },
    });
    await finishedSubmission(assignmentId, ani.membershipId, {
      result: { level: "3_partial_offloading", score: 62, computedAt: new Date("2026-10-01T10:00:00Z") },
      factors: [
        { factor: "upaya_mandiri", contribution: 18 },
        { factor: "kedalaman_revisi", contribution: 9 },
        { factor: "kualitas_refleksi", contribution: -6 },
      ],
    });
    // Budi: a first attempt that was replaced by a second.
    await finishedSubmission(assignmentId, budi.membershipId, { attempt: 1, result: { level: "4_full_offloading", score: 90, computedAt: new Date("2026-10-01T10:00:00Z") } });
    await finishedSubmission(assignmentId, budi.membershipId, {
      attempt: 2,
      result: { level: "1_ai_as_tool", score: 15, computedAt: new Date("2026-10-02T10:00:00Z") },
      factors: [{ factor: "upaya_mandiri", contribution: 4 }],
    });
    // Citra: still at Stage 3.
    await finishedSubmission(assignmentId, citra.membershipId, { status: "in_progress", stagesDone: 2 });

    const reply = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}/analytics`);
    expect(reply.status).toBe(200);
    const body = reply.body;
    expect(body.counts).toEqual({ enrolled: 4, notStarted: 1, inProgress: 1, submitted: 2, analyzed: 2 });
    expect(body.distribution).toEqual([
      { level: "1_ai_as_tool", count: 1 },
      { level: "2_ai_as_scaffold", count: 0 },
      { level: "3_partial_offloading", count: 1 },
      { level: "4_full_offloading", count: 0 },
    ]);
    // Only factors that pushed toward offloading are "recurring problems".
    expect(body.commonFactors.map((f: any) => f.factor)).toEqual(["upaya_mandiri", "kedalaman_revisi"]);
    expect(body.commonFactors[0]).toMatchObject({ students: 2, averageContribution: 11 });

    const byName = Object.fromEntries(body.students.map((row: any) => [row.name, row]));
    expect(body.students.map((row: any) => row.name)).toEqual(["Ani", "Budi", "Citra", "Dodi"]);
    expect(byName.Ani.offloading).toMatchObject({ level: "3_partial_offloading", score: 62, previousScore: 40 });
    expect(byName.Ani.offloading.topFactor.factor).toBe("upaya_mandiri");
    expect(byName.Budi.offloading).toMatchObject({ level: "1_ai_as_tool", score: 15 });
    expect(byName.Citra).toMatchObject({ status: "in_progress", stagesCompleted: 2, offloading: null });
    expect(byName.Dodi).toMatchObject({ status: "not_started", submissionId: null, offloading: null });
  });
});

describe("one student's process", () => {
  test("lays out the five stages, the tutor turns with their intent, the Index and the trend", async () => {
    const { teacher, courseId, scenarioId, assignmentId } = await setup();
    const earlierAssignment = await newAssignment(teacher, courseId, scenarioId);
    const ani = await student(teacher, courseId, "Ani");
    await finishedSubmission(earlierAssignment, ani.membershipId, {
      result: { level: "2_ai_as_scaffold", score: 40, computedAt: new Date("2026-09-01T10:00:00Z") },
    });
    const subId = await finishedSubmission(assignmentId, ani.membershipId, {
      result: { level: "3_partial_offloading", score: 62, computedAt: new Date("2026-10-01T10:00:00Z") },
      factors: [{ factor: "upaya_mandiri", contribution: 18 }],
      prompts: [
        { content: "Kasih jawabannya dong", intent: "direct_answer", redirected: true },
        { content: "Kenapa langkah kedua begitu?", intent: "explanation_hint" },
      ],
    });

    const reply = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}/submissions/${subId}`);
    expect(reply.status).toBe(200);
    const body = reply.body;
    expect(body.student.name).toBe("Ani");
    expect(body.stages.map((s: any) => s.stage)).toEqual([...STAGES]);
    expect(body.stages[0]).toMatchObject({ status: "completed", versions: 2, content: "Draf awal final" });
    expect(body.stages[1]).toMatchObject({ versions: 0, content: null });
    expect(body.tutor).toMatchObject({
      promptCount: 2,
      intents: { direct_answer: 1, explanation_hint: 1, reflective_evaluative: 0 },
      redirected: 1,
    });
    expect(body.tutor.messages).toHaveLength(4);
    expect(body.offloading).toMatchObject({ level: "3_partial_offloading", score: 62 });
    expect(body.offloading.factors[0].factor).toBe("upaya_mandiri");
    expect(body.trend.map((t: any) => [t.score, t.current])).toEqual([[40, false], [62, true]]);
  });

  test("a submission of another assignment is not reachable through this one", async () => {
    const { teacher, courseId, scenarioId, assignmentId } = await setup();
    const other = await newAssignment(teacher, courseId, scenarioId);
    const ani = await student(teacher, courseId, "Ani");
    const subId = await finishedSubmission(other, ani.membershipId);
    expect((await api(teacher, "GET", `/api/manage/assignments/${assignmentId}/submissions/${subId}`)).status).toBe(404);
  });
});

describe("writing signal (sinyal 1)", () => {
  async function startedSubmission() {
    const { teacher, courseId, assignmentId } = await setup();
    expect((await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { status: "published" })).status).toBe(200);
    const learner = await student(teacher, courseId, "Ani");
    const started = await api(learner.client, "POST", `/api/student/assignments/${assignmentId}/submissions`);
    expect(started.status).toBe(201);
    const submissionId = (started.body.submission?.id ?? started.body.id) as string;
    return { teacher, learner, assignmentId, submissionId };
  }
  const complete = (client: Client, submissionId: string, stage: string, body: Record<string, unknown>) =>
    api(client, "POST", `/api/student/submissions/${submissionId}/stages/${stage}/complete`, body);

  test("is stored with the Stage 1 text, clamped, and shown to the teacher", async () => {
    const { teacher, learner, assignmentId, submissionId } = await startedSubmission();
    const content = "Draf awal saya tentang luas taman maksimum dengan keliling tetap.";
    const reply = await complete(learner.client, submissionId, "1_independent_effort", {
      content,
      signals: {
        activeSeconds: 95.4,
        typedChars: 30,
        deletedChars: -5,
        pasteCount: 1,
        pastedChars: 40,
        largestPaste: 999,
        longPauses: 2,
        focusLosses: 3,
        recorderVersion: "web-v1",
      },
    });
    expect(reply.status).toBe(200);

    const [row] = await db.select().from(writingSignal).where(eq(writingSignal.submissionId, submissionId));
    expect(row).toMatchObject({
      stage: "1_independent_effort",
      activeSeconds: 95,
      typedChars: 30,
      deletedChars: 0,
      pastedChars: 40,
      largestPaste: 40,
      finalChars: content.length,
      recorderVersion: "web-v1",
    });

    const process = await api(teacher, "GET", `/api/manage/assignments/${assignmentId}/submissions/${submissionId}`);
    expect(process.body.stages[0].writing).toMatchObject({ pasteCount: 1, focusLosses: 3, pastedShare: 0.62 });
    expect(process.body.stages[3].writing).toBeNull();
  });

  test("a stage without a written text, or a malformed signal, stores nothing and still completes", async () => {
    const { learner, submissionId } = await startedSubmission();
    expect((await complete(learner.client, submissionId, "1_independent_effort", { content: "Draf awal yang cukup panjang.", signals: "rusak" })).status).toBe(200);
    expect((await complete(learner.client, submissionId, "2_guided_questioning", { content: "", signals: { typedChars: 5 } })).status).toBe(200);
    const rows = await db.select().from(writingSignal).where(eq(writingSignal.submissionId, submissionId));
    expect(rows).toHaveLength(0);
  });
});

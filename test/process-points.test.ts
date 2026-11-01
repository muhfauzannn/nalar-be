import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";

import { db } from "../src/database/client";
import {
  courseMembership,
  offloadingIndexResult,
  processPointEvent,
  promptClassification,
  stageArtifact,
  stageProgress,
  submission,
  tutorConversation,
  tutorMessage,
  writingSignal,
} from "../src/database/schema";
import {
  evaluateProcessPoints,
  revisionDepth,
  type PointInputs,
} from "../src/modules/gamification/process-points.rules";
import { api, joinCourse, makeCourse, makeScenario, newUser, publishCourse, type Client } from "./helpers";

const STAGES = [
  "1_independent_effort",
  "2_guided_questioning",
  "3_ai_evaluation",
  "4_revision_finalization",
  "5_reflection",
] as const;

const DRAFT =
  "Menurut saya luas taman paling besar terjadi ketika panjang dan lebar sama, karena keliling tetap empat puluh meter sehingga sisi sepuluh meter.";
const EVALUATION =
  "Jawaban AI sudah menyebut rumus luas, tetapi belum menjelaskan kenapa bentuk persegi memberi luas maksimum. Contohnya juga kurang tepat karena memakai keliling yang berbeda dari soal, jadi kesimpulannya tidak sesuai dengan data kita.";
const REVISION =
  "Saya membandingkan beberapa ukuran: tiga kali tujuh belas memberi lima puluh satu, delapan kali dua belas memberi sembilan puluh enam, dan sepuluh kali sepuluh memberi seratus. Dari tabel itu terlihat luas naik ketika selisih sisi mengecil, jadi persegi adalah bentuk terbaik untuk keliling empat puluh meter.";
const REFLECTION =
  "Awalnya saya hanya menebak bahwa persegi paling luas tanpa bukti. Setelah bertanya kepada tutor tentang cara membandingkan, saya membuat tabel ukuran dan ternyata pola selisih sisi menjelaskan alasannya. Bagian yang paling saya pelajari adalah mengecek klaim dengan beberapa contoh sebelum menulis kesimpulan, dan lain kali saya akan melakukannya sejak draf pertama.";

const fullInputs = (overrides: Partial<PointInputs> = {}): PointInputs => ({
  completedStages: [...STAGES],
  texts: {
    "1_independent_effort": DRAFT,
    "3_ai_evaluation": EVALUATION,
    "4_revision_finalization": REVISION,
    "5_reflection": REFLECTION,
  },
  writing: {
    "1_independent_effort": { pastedChars: 0, finalChars: DRAFT.length },
    "4_revision_finalization": { pastedChars: 10, finalChars: REVISION.length },
  },
  intents: ["direct_answer", "explanation_hint", "reflective_evaluative"],
  ...overrides,
});

describe("Poin Nalar rules", () => {
  test("a full, careful process earns every kind once", () => {
    const kinds = evaluateProcessPoints(fullInputs()).map((award) => award.kind);
    expect(kinds).toEqual([
      "independent_draft",
      "hint_request",
      "reflective_question",
      "critical_evaluation",
      "substantial_revision",
      "specific_reflection",
      "journey_complete",
    ]);
  });

  test("a pasted draft, a copied revision and direct-answer prompts earn nothing for those steps", () => {
    const kinds = evaluateProcessPoints(
      fullInputs({
        texts: { ...fullInputs().texts, "4_revision_finalization": DRAFT },
        writing: { "1_independent_effort": { pastedChars: DRAFT.length, finalChars: DRAFT.length } },
        intents: ["direct_answer", "direct_answer"],
      }),
    ).map((award) => award.kind);
    expect(kinds).not.toContain("independent_draft");
    expect(kinds).not.toContain("substantial_revision");
    expect(kinds).not.toContain("hint_request");
    // Using AI for direct answers takes nothing away from the rest.
    expect(kinds).toContain("critical_evaluation");
  });

  test("nothing is awarded for a stage that is not completed yet", () => {
    const awards = evaluateProcessPoints(fullInputs({ completedStages: ["1_independent_effort"] }));
    expect(awards.map((award) => award.kind)).toEqual(["independent_draft"]);
  });

  test("revision depth measures changed words", () => {
    expect(revisionDepth("a b c d", "a b c d")).toBe(0);
    expect(revisionDepth("a b c d", "w x y z")).toBe(1);
    expect(revisionDepth("a b c d", "a b x y")).toBe(0.5);
  });
});

describe("guardrail: the AI Offloading Index never feeds Poin Nalar", () => {
  test("the gamification module does not read Index tables or the analysis module", async () => {
    const dir = join(import.meta.dir, "../src/modules/gamification");
    for (const file of await readdir(dir)) {
      const source = await readFile(join(dir, file), "utf8");
      const code = source.replace(/\/\/.*$/gm, "");
      expect({ file, hit: code.match(/offloadingIndexResult|explanationFactor|ai-analysis|offloading/i)?.[0] ?? null }).toEqual({ file, hit: null });
    }
  });

  test("the rules accept no Index input", () => {
    const inputs = fullInputs() as PointInputs & Record<string, unknown>;
    const withIndex = { ...inputs, offloading: { level: "4_full_offloading", score: 95 } };
    expect(evaluateProcessPoints(withIndex)).toEqual(evaluateProcessPoints(inputs));
  });
});

async function setup() {
  const teacher = await newUser("guru");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const scn = await makeScenario();
  const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, { scenarioId: scn.id });
  const assignmentId = created.body.id as string;
  expect((await api(teacher, "PATCH", `/api/manage/assignments/${assignmentId}`, { status: "published" })).status).toBe(200);
  return { teacher, courseId: course.id as string, assignmentId };
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

// A finished journey written straight to the DB, as work done before the ledger existed.
async function finishedJourney(assignmentId: string, membershipId: string, index?: "1_ai_as_tool" | "4_full_offloading") {
  const [sub] = await db
    .insert(submission)
    .values({ assignmentId, studentCourseMembershipId: membershipId, status: "submitted", currentStage: "5_reflection", submittedAt: new Date() })
    .returning({ id: submission.id });
  const id = sub!.id;
  await db.insert(stageProgress).values(STAGES.map((stage) => ({ submissionId: id, stage, status: "completed" as const })));
  await db.insert(stageArtifact).values([
    { submissionId: id, stage: "1_independent_effort", content: DRAFT, version: 1, isFinal: true },
    { submissionId: id, stage: "3_ai_evaluation", content: EVALUATION, version: 1, isFinal: true },
    { submissionId: id, stage: "4_revision_finalization", content: REVISION, version: 1, isFinal: true },
    { submissionId: id, stage: "5_reflection", content: REFLECTION, version: 1, isFinal: true },
  ]);
  await db.insert(writingSignal).values({
    submissionId: id,
    stage: "1_independent_effort",
    activeSeconds: 300,
    typedChars: DRAFT.length,
    deletedChars: 4,
    pasteCount: 0,
    pastedChars: 0,
    largestPaste: 0,
    longPauses: 1,
    focusLosses: 0,
    finalChars: DRAFT.length,
    recorderVersion: "web-v1",
  });
  if (index) {
    await db.insert(offloadingIndexResult).values({
      submissionId: id,
      level: index,
      score: index === "1_ai_as_tool" ? "10.00" : "95.00",
      intentInput: "50.00",
      effortInput: "50.00",
      studentReport: "Laporan.",
      recommendations: [],
      scoringVersion: "test",
      computedAt: new Date(),
    });
  }
  return id;
}

describe("island map and Poin Nalar ledger", () => {
  test("stage completion reports the points it earned, once", async () => {
    const { teacher, courseId, assignmentId } = await setup();
    const learner = await student(teacher, courseId, "Ani");
    const started = await api(learner.client, "POST", `/api/student/assignments/${assignmentId}/submissions`);
    const submissionId = (started.body.submission?.id ?? started.body.id) as string;
    const complete = (stage: string, body: Record<string, unknown>) =>
      api(learner.client, "POST", `/api/student/submissions/${submissionId}/stages/${stage}/complete`, body);

    const first = await complete("1_independent_effort", {
      content: DRAFT,
      signals: { typedChars: DRAFT.length, pastedChars: 0, recorderVersion: "web-v1" },
    });
    expect(first.status).toBe(200);
    expect(first.body.points).toEqual([{ kind: "independent_draft", stage: "1_independent_effort", points: 20 }]);

    const [conversation] = await db.insert(tutorConversation).values({ submissionId }).returning({ id: tutorConversation.id });
    const [message] = await db
      .insert(tutorMessage)
      .values({ conversationId: conversation!.id, clientEventId: crypto.randomUUID(), author: "student", content: "Bagaimana cara membandingkan?", mode: "hint", sequence: 1 })
      .returning({ id: tutorMessage.id });
    await db.insert(promptClassification).values({ messageId: message!.id, intent: "explanation_hint", confidence: "0.900", classifierVersion: "test" });

    const second = await complete("2_guided_questioning", { content: "" });
    expect(second.body.points).toEqual([{ kind: "hint_request", stage: "2_guided_questioning", points: 10 }]);

    const third = await complete("3_ai_evaluation", { content: "Jawabannya oke." });
    expect(third.body.points).toEqual([]);

    const rows = await db.select().from(processPointEvent).where(eq(processPointEvent.submissionId, submissionId));
    expect(rows.map((row) => row.kind).sort()).toEqual(["hint_request", "independent_draft"]);
  });

  test("the island backfills earlier work, opens the chest and counts the class bridge without the teacher", async () => {
    const { teacher, courseId, assignmentId } = await setup();
    const ani = await student(teacher, courseId, "Ani");
    const budi = await student(teacher, courseId, "Budi");
    await finishedJourney(assignmentId, ani.membershipId);

    const reply = await api(ani.client, "GET", `/api/student/courses/${courseId}/island`);
    expect(reply.status).toBe(200);
    expect(reply.body.points.total).toBe(95);
    expect(reply.body.bridge).toEqual({ planks: 1, total: 2, students: 2 });
    const [building] = reply.body.buildings;
    expect(building.chestOpen).toBe(true);
    expect(building.posts.map((post: { status: string }) => post.status)).toEqual(["done", "done", "done", "done", "done"]);
    expect(reply.body.badges.find((badge: { id: string }) => badge.id === "penjelajah").earned).toBe(true);

    // No tutor prompts were written, so 20 + 20 + 25 + 20 + 10. Reading again does not award twice; another student sees their own points only.
    expect((await api(ani.client, "GET", `/api/student/courses/${courseId}/island`)).body.points.total).toBe(95);
    const other = await api(budi.client, "GET", `/api/student/courses/${courseId}/island`);
    expect(other.body.points.total).toBe(0);
    expect(other.body.buildings[0].posts[0].status).toBe("locked");
    expect(JSON.stringify(other.body)).not.toContain("Ani");
  });

  test("two identical processes earn the same points whatever their Index says", async () => {
    const { teacher, courseId, assignmentId } = await setup();
    const low = await student(teacher, courseId, "Citra");
    const high = await student(teacher, courseId, "Dodi");
    await finishedJourney(assignmentId, low.membershipId, "1_ai_as_tool");
    await finishedJourney(assignmentId, high.membershipId, "4_full_offloading");
    const a = await api(low.client, "GET", `/api/student/courses/${courseId}/island`);
    const b = await api(high.client, "GET", `/api/student/courses/${courseId}/island`);
    expect(a.body.points.total).toBe(b.body.points.total);
    expect(JSON.stringify(a.body)).not.toMatch(/offloading|score|level/i);
  });

  test("only a student of the course can open its island", async () => {
    const { courseId } = await setup();
    const stranger = await newUser("orang-lain");
    expect((await api(stranger, "GET", `/api/student/courses/${courseId}/island`)).status).toBe(404);
  });

  test("the dashboard total adds up every course", async () => {
    const { teacher, courseId, assignmentId } = await setup();
    const ani = await student(teacher, courseId, "Ani");
    await finishedJourney(assignmentId, ani.membershipId);
    const reply = await api(ani.client, "GET", "/api/student/points");
    expect(reply.status).toBe(200);
    expect(reply.body.total).toBe(95);
    expect(reply.body.recent[0].assignmentId).toBe(assignmentId);
  });
});

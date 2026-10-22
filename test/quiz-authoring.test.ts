import { describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../src/database/client";
import { courseMembership, quiz, quizAttempt } from "../src/database/schema";
import {
  api,
  expectNoKeys,
  joinCourse,
  makeCourse,
  multipleChoice,
  newUser,
  publishCourse,
  shortAnswer,
  type Client,
} from "./helpers";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup() {
  const teacher = await newUser("teacher");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, {
    title: "Kuis Dasar",
    timeLimitMinutes: 30,
  });
  expect(created.status).toBe(201);
  return { teacher, course, quizId: created.body.id as string };
}

async function addBoth(teacher: Client, quizId: string) {
  const mc = await api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, multipleChoice());
  const sa = await api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, shortAnswer());
  expect(mc.status).toBe(201);
  expect(sa.status).toBe(201);
  return { mcId: mc.body.id as string, saId: sa.body.id as string };
}

const publish = (teacher: Client, quizId: string) =>
  api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { status: "published" });

async function studentFor(courseJoinCode: string, label = "student") {
  const student = await newUser(label);
  expect((await joinCourse(student, courseJoinCode)).status).toBe(200);
  return student;
}

async function answersFor(student: Client, quizId: string, correct: { mc: boolean; sa: boolean }) {
  const view = await api(student, "GET", `/api/student/quizzes/${quizId}`);
  return view.body.questions.map((question: any) => {
    if (question.type === "multiple_choice") {
      const wanted = correct.mc ? "4" : "3";
      return {
        questionId: question.id,
        selectedOptionId: question.options.find((option: any) => option.label === wanted).id,
      };
    }
    return { questionId: question.id, textAnswer: correct.sa ? "  jakarta " : "Bandung" };
  });
}

async function editorJoinCode(teacher: Client, courseId: string) {
  return (await api(teacher, "GET", `/api/manage/courses/${courseId}`)).body.course.joinCode as string;
}

describe("quiz publication gate", () => {
  test("a new quiz is a draft and cannot be published until it has valid questions", async () => {
    const { teacher, quizId } = await setup();

    const editor = await api(teacher, "GET", `/api/manage/quizzes/${quizId}`);
    expect(editor.body.quiz.status).toBe("draft");
    expect(editor.body.readiness).toEqual({ ready: false, questionCount: 0, problems: [] });

    const empty = await publish(teacher, quizId);
    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe("QUIZ_NOT_READY");

    await addBoth(teacher, quizId);
    expect((await api(teacher, "GET", `/api/manage/quizzes/${quizId}`)).body.readiness.ready).toBe(true);
    expect((await publish(teacher, quizId)).status).toBe(200);
  });

  test("a bad question is rejected when written, so an invalid quiz can never be stored", async () => {
    const { teacher, quizId } = await setup();
    const bad: Array<[string, unknown]> = [
      ["no correct option", multipleChoice({ options: [{ label: "a", isCorrect: false }, { label: "b", isCorrect: false }] })],
      ["two correct options", multipleChoice({ options: [{ label: "a", isCorrect: true }, { label: "b", isCorrect: true }] })],
      ["one option only", multipleChoice({ options: [{ label: "a", isCorrect: true }] })],
      ["more than 8 options", multipleChoice({ options: Array.from({ length: 9 }, (_, i) => ({ label: `o${i}`, isCorrect: i === 0 })) })],
      ["duplicate option labels", multipleChoice({ options: [{ label: "Ya", isCorrect: true }, { label: "ya", isCorrect: false }] })],
      ["short answer without accepted answers", shortAnswer({ acceptedAnswers: [] })],
      ["blank accepted answer", shortAnswer({ acceptedAnswers: ["  "] })],
      ["zero points", multipleChoice({ points: 0 })],
      ["negative points", multipleChoice({ points: -1 })],
      ["empty prompt", multipleChoice({ prompt: "   " })],
      ["unknown type", { ...multipleChoice(), type: "essay" }],
    ];
    for (const [name, body] of bad) {
      const reply = await api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, body);
      expect({ name, status: reply.status }).toEqual({ name, status: 400 });
    }
    expect((await api(teacher, "GET", `/api/manage/quizzes/${quizId}`)).body.readiness.questionCount).toBe(0);
  });

  test("duplicate accepted answers collapse using the grader's own normalisation", async () => {
    const { teacher, quizId } = await setup();
    const reply = await api(
      teacher,
      "POST",
      `/api/manage/quizzes/${quizId}/questions`,
      shortAnswer({ acceptedAnswers: ["Jakarta", " jakarta ", "JAKARTA", "Nusantara"] }),
    );
    expect(reply.status).toBe(201);
    const editor = await api(teacher, "GET", `/api/manage/quizzes/${quizId}`);
    expect(editor.body.questions[0].acceptedAnswers).toEqual(["Jakarta", "Nusantara"]);
  });

  test("schedule and time-limit validation", async () => {
    const { teacher, quizId, course } = await setup();
    const reversed = await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, {
      availableAt: "2030-01-02T00:00:00Z",
      dueAt: "2030-01-01T00:00:00Z",
    });
    expect(reversed.status).toBe(400);
    expect(reversed.body.code).toBe("INVALID_SCHEDULE");
    expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { timeLimitMinutes: 0 })).status).toBe(400);
    expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { dueAt: "bukan tanggal" })).status).toBe(400);
    expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, {})).status).toBe(400);
    const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, {
      title: "X",
      dueAt: "2030-01-02T00:00:00Z",
      closesAt: "2030-01-01T00:00:00Z",
    });
    expect(created.status).toBe(400);
  });
});

describe("draft-only editing", () => {
  test("a published quiz must go back to draft before its questions change", async () => {
    const { teacher, quizId } = await setup();
    const { mcId } = await addBoth(teacher, quizId);
    await publish(teacher, quizId);

    const blocked = await api(teacher, "PUT", `/api/manage/questions/${mcId}`, multipleChoice({ prompt: "Baru" }));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("QUIZ_NOT_DRAFT");

    expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { status: "draft" })).status).toBe(200);
    const edited = await api(teacher, "PUT", `/api/manage/questions/${mcId}`, multipleChoice({ prompt: "Baru" }));
    expect(edited.status).toBe(200);
    const editor = await api(teacher, "GET", `/api/manage/quizzes/${quizId}`);
    expect(editor.body.questions.find((q: any) => q.id === mcId).prompt).toBe("Baru");
  });

  test("question type can change; options and accepted answers follow", async () => {
    const { teacher, quizId } = await setup();
    const { mcId } = await addBoth(teacher, quizId);
    const asShort = await api(teacher, "PUT", `/api/manage/questions/${mcId}`, shortAnswer({ acceptedAnswers: ["4", "empat"] }));
    expect(asShort.status).toBe(200);
    let question = (await api(teacher, "GET", `/api/manage/quizzes/${quizId}`)).body.questions.find((q: any) => q.id === mcId);
    expect(question.type).toBe("short_answer");
    expect(question.options).toEqual([]);
    expect(question.acceptedAnswers).toEqual(["4", "empat"]);

    await api(teacher, "PUT", `/api/manage/questions/${mcId}`, multipleChoice());
    question = (await api(teacher, "GET", `/api/manage/quizzes/${quizId}`)).body.questions.find((q: any) => q.id === mcId);
    expect(question.type).toBe("multiple_choice");
    expect(question.acceptedAnswers).toBeNull();
    expect(question.options.map((o: any) => o.label)).toEqual(["3", "4", "5"]);
    expect(question.options.filter((o: any) => o.isCorrect)).toHaveLength(1);
  });

  test("question can be deleted while editable", async () => {
    const { teacher, quizId } = await setup();
    const { mcId } = await addBoth(teacher, quizId);
    expect((await api(teacher, "DELETE", `/api/manage/questions/${mcId}`)).status).toBe(200);
    expect((await api(teacher, "GET", `/api/manage/quizzes/${quizId}`)).body.readiness.questionCount).toBe(1);
  });
});

describe("a student takes an authored quiz", () => {
  test("the answer key never reaches the student while the attempt is open, and grading uses the teacher's key", async () => {
    const { teacher, course, quizId } = await setup();
    await addBoth(teacher, quizId);
    expect((await publish(teacher, quizId)).status).toBe(200);
    const student = await studentFor(await editorJoinCode(teacher, course.id));

    const before = await api(student, "GET", `/api/student/quizzes/${quizId}`);
    expect(before.status).toBe(200);
    expect(before.body.canStart).toBe(true);
    expect(before.body.questions).toHaveLength(2);
    expect(expectNoKeys(before.body, ["isCorrect", "acceptedAnswers", "correctAnswer", "explanation"])).toEqual([]);

    const started = await api(student, "POST", `/api/student/quizzes/${quizId}/attempts`, {});
    expect(started.status).toBe(201);
    const during = await api(student, "GET", `/api/student/quizzes/${quizId}`);
    expect(expectNoKeys(during.body, ["isCorrect", "acceptedAnswers", "correctAnswer", "explanation"])).toEqual([]);

    const answers = await answersFor(student, quizId, { mc: true, sa: true });
    const submitted = await api(student, "POST", `/api/student/quiz-attempts/${started.body.id}/submit`, { answers });
    expect(submitted.status).toBe(200);
    expect(submitted.body.score).toBe("100.00");

    // After submitting, the review is allowed to show the key.
    const review = await api(student, "GET", `/api/student/quizzes/${quizId}`);
    const mc = review.body.questions.find((q: any) => q.type === "multiple_choice");
    expect(mc.options.find((o: any) => o.label === "4").isCorrect).toBe(true);
    expect(review.body.questions.find((q: any) => q.type === "short_answer").correctAnswer).toBe("Jakarta");
  });

  test("scores follow the authored points: wrong MC, right short answer = 2 of 3 points", async () => {
    const { teacher, course, quizId } = await setup();
    await addBoth(teacher, quizId); // MC = 1 point, SA = 2 points
    await publish(teacher, quizId);
    const student = await studentFor(await editorJoinCode(teacher, course.id));
    const started = await api(student, "POST", `/api/student/quizzes/${quizId}/attempts`, {});
    const submitted = await api(student, "POST", `/api/student/quiz-attempts/${started.body.id}/submit`, {
      answers: await answersFor(student, quizId, { mc: false, sa: true }),
    });
    expect(submitted.body.score).toBe("66.67");
  });

  test("a draft quiz is invisible to students", async () => {
    const { teacher, course, quizId } = await setup();
    await addBoth(teacher, quizId);
    const student = await studentFor(await editorJoinCode(teacher, course.id));
    expect((await api(student, "GET", `/api/student/quizzes/${quizId}`)).status).toBe(404);
  });
});

describe("the lock once a student has started", () => {
  async function startedQuiz() {
    const { teacher, course, quizId } = await setup();
    const { mcId } = await addBoth(teacher, quizId);
    await publish(teacher, quizId);
    const student = await studentFor(await editorJoinCode(teacher, course.id));
    const started = await api(student, "POST", `/api/student/quizzes/${quizId}/attempts`, {});
    expect(started.status).toBe(201);
    return { teacher, course, quizId, mcId, student, attemptId: started.body.id as string };
  }

  test("questions, options, keys, order, time limit and draft status are frozen", async () => {
    const { teacher, quizId, mcId } = await startedQuiz();

    const attempts = [
      api(teacher, "POST", `/api/manage/quizzes/${quizId}/questions`, multipleChoice()),
      api(teacher, "PUT", `/api/manage/questions/${mcId}`, multipleChoice({ prompt: "Diam-diam diganti" })),
      api(teacher, "DELETE", `/api/manage/questions/${mcId}`),
    ];
    for (const reply of await Promise.all(attempts)) {
      expect(reply.status).toBe(409);
      expect(reply.body.code).toBe("QUIZ_LOCKED");
    }
    const editor = await api(teacher, "GET", `/api/manage/quizzes/${quizId}`);
    const ids = editor.body.questions.map((q: any) => q.id);
    expect((await api(teacher, "PUT", `/api/manage/quizzes/${quizId}/questions/order`, { ids: [...ids].reverse() })).body.code).toBe("QUIZ_LOCKED");
    expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { timeLimitMinutes: 45 })).body.code).toBe("QUIZ_LOCKED");
    const revert = await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { status: "draft" });
    expect(revert.status).toBe(409);
    expect(revert.body.code).toBe("INVALID_TRANSITION");

    expect(editor.body.locked).toBe(true);
    expect(editor.body.editable).toBe(false);
    expect(editor.body.questions.find((q: any) => q.id === mcId).prompt).toBe("Berapa 2 + 2?");
  });

  test("title, instructions, schedule and closing/archiving remain possible", async () => {
    const { teacher, quizId } = await startedQuiz();
    const meta = await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, {
      title: "Judul baru",
      instructions: "Baca teliti.",
      dueAt: "2031-01-01T00:00:00Z",
    });
    expect(meta.status).toBe(200);
    expect((await api(teacher, "PATCH", `/api/manage/quizzes/${quizId}`, { status: "closed" })).status).toBe(200);
    expect((await api(teacher, "DELETE", `/api/manage/quizzes/${quizId}`)).status).toBe(200);
  });

  test("duplicating gives an editable copy and leaves the original untouched", async () => {
    const { teacher, course, quizId } = await startedQuiz();
    const copy = await api(teacher, "POST", `/api/manage/quizzes/${quizId}/duplicate`);
    expect(copy.status).toBe(201);

    const copyEditor = await api(teacher, "GET", `/api/manage/quizzes/${copy.body.id}`);
    expect(copyEditor.body.quiz.status).toBe("draft");
    expect(copyEditor.body.quiz.title).toBe("Kuis Dasar (salinan)");
    expect(copyEditor.body.editable).toBe(true);
    expect(copyEditor.body.questions).toHaveLength(2);
    expect(copyEditor.body.readiness.ready).toBe(true);

    const mc = copyEditor.body.questions.find((q: any) => q.type === "multiple_choice");
    expect((await api(teacher, "PUT", `/api/manage/questions/${mc.id}`, multipleChoice({ prompt: "Versi 2" }))).status).toBe(200);

    const original = await api(teacher, "GET", `/api/manage/quizzes/${quizId}`);
    expect(original.body.questions.find((q: any) => q.type === "multiple_choice").prompt).toBe("Berapa 2 + 2?");
    expect(original.body.locked).toBe(true);
    // ... and both quizzes live in the same course.
    const courseView = await api(teacher, "GET", `/api/manage/courses/${course.id}`);
    expect(courseView.body.quizzes).toHaveLength(2);
  });

  test("the course editor reports attempt counts per quiz", async () => {
    const { teacher, course, quizId } = await startedQuiz();
    const view = await api(teacher, "GET", `/api/manage/courses/${course.id}`);
    expect(view.body.quizzes.find((q: any) => q.id === quizId)).toMatchObject({
      attemptCount: 1,
      questionCount: 2,
    });
  });
});

describe("teacher edit versus student start (row-lock serialisation)", () => {
  test("an attempt that is mid-insert makes a concurrent edit wait, then refuse", async () => {
    const { teacher, course, quizId } = await setup();
    const { mcId } = await addBoth(teacher, quizId);
    // Keep the quiz in DRAFT here so the only thing that can stop the edit is the attempt.
    const student = await newUser("student");
    await publishCourse(teacher, course.id);
    expect((await joinCourse(student, await editorJoinCode(teacher, course.id))).status).toBe(200);
    const [membership] = await db
      .select({ id: courseMembership.id })
      .from(courseMembership)
      .where(and(eq(courseMembership.courseId, course.id), eq(courseMembership.userId, student.id)));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const insertTx = db.transaction(async (tx) => {
      await tx.insert(quizAttempt).values({ quizId, studentCourseMembershipId: membership!.id });
      await gate; // uncommitted: the attempt exists only inside this transaction
    });
    await sleep(150);

    const edit = api(teacher, "PUT", `/api/manage/questions/${mcId}`, multipleChoice({ prompt: "Curang" }));
    const outcome = await Promise.race([edit.then(() => "finished"), sleep(500).then(() => "blocked")]);
    expect(outcome).toBe("blocked");

    release();
    await insertTx;
    const reply = await edit;
    expect(reply.status).toBe(409);
    expect(reply.body.code).toBe("QUIZ_LOCKED");
  });

  test("a teacher edit in flight makes a student's start wait for it", async () => {
    const { teacher, course, quizId } = await setup();
    await addBoth(teacher, quizId);
    await publish(teacher, quizId);
    const student = await studentFor(await editorJoinCode(teacher, course.id));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const editTx = db.transaction(async (tx) => {
      await tx.execute(sql`select id from quiz where id = ${quizId} for update`);
      await gate; // the teacher's edit transaction is still open
    });
    await sleep(150);

    const start = api(student, "POST", `/api/student/quizzes/${quizId}/attempts`, {});
    const outcome = await Promise.race([start.then(() => "finished"), sleep(500).then(() => "blocked")]);
    expect(outcome).toBe("blocked");

    release();
    await editTx;
    expect((await start).status).toBe(201);
    const counted = (await db.execute(
      sql`select count(*)::int as total from quiz_attempt where quiz_id = ${quizId}`,
    )) as unknown as Array<{ total: number }>;
    expect(counted[0]?.total).toBe(1);
  });
});

describe("quizzes of other courses", () => {
  test("the same account can teach one course and attend another", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const aliceCourse = await makeCourse(alice, { name: "Kelas Alice" });
    await publishCourse(alice, aliceCourse.id);
    const bobCourse = await makeCourse(bob, { name: "Kelas Bob" });
    await publishCourse(bob, bobCourse.id);

    expect((await joinCourse(alice, bobCourse.joinCode)).status).toBe(200);
    const mine = await api(alice, "GET", "/api/manage/courses");
    const attending = await api(alice, "GET", "/api/student/courses");
    expect(mine.body.courses.map((c: any) => c.name)).toEqual(["Kelas Alice"]);
    expect(attending.body.courses.map((c: any) => c.name)).toEqual(["Kelas Alice", "Kelas Bob"]);
    // Bob's quiz tooling stays closed to Alice even though she attends his course.
    const bobQuiz = await api(bob, "POST", `/api/manage/courses/${bobCourse.id}/quizzes`, { title: "Rahasia" });
    expect((await api(alice, "GET", `/api/manage/quizzes/${bobQuiz.body.id}`)).status).toBe(404);
    const [row] = await db.select({ status: quiz.status }).from(quiz).where(eq(quiz.id, bobQuiz.body.id));
    expect(row?.status).toBe("draft");
  });
});

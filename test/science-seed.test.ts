import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/database/client";
import { course, learningResource, quizAttempt, quizOption, quizQuestion } from "../src/database/schema";
import { seedScienceCourse } from "../src/database/seeds/science-course";
import { api, download, expectNoKeys, makePdf, multipart, newUser } from "./helpers";

test("the MIPA seed publishes eight lessons and a complete 20-question quiz that can be started and graded", async () => {
  const owner = await newUser("mipa-teacher");
  const seeded = await seedScienceCourse(owner.id);
  expect(seeded.created).toBe(true);
  const list = await api(owner, "GET", "/api/student/courses");
  expect(list.body.courses.map((entry: { id: string }) => entry.id)).toEqual([seeded.courseId]);
  const editor = await api(owner, "GET", `/api/manage/courses/${seeded.courseId}`);
  expect(editor.status).toBe(200);
  expect(editor.body.studentCount).toBe(0);
  const view = await api(owner, "GET", `/api/student/courses/${seeded.courseId}`);
  expect(view.body.modules).toHaveLength(4);
  const materials = view.body.modules.flatMap((module: { lessons: Array<{ id: string }> }) => module.lessons);
  expect(materials).toHaveLength(8);
  for (const material of materials) {
    const lesson = await api(owner, "GET", `/api/student/lessons/${material.id}`);
    expect(lesson.status).toBe(200);
    expect(lesson.body.content.length).toBeGreaterThan(100);
  }
  const quiz = await api(owner, "GET", `/api/student/quizzes/${seeded.quizId}`);
  expect(quiz.body.canStart).toBe(true);
  expect(quiz.body.attempt).toBeNull();
  expect(quiz.body.quiz).toMatchObject({ status: "published", timeLimitMinutes: 60, availableAt: null, dueAt: null, closesAt: null });
  expect(quiz.body.questions).toHaveLength(20);
  expect(quiz.body.questions.reduce((sum: number, question: { points: string }) => sum + Number(question.points), 0)).toBe(100);
  for (const subject of ["Matematika", "Biologi", "Kimia", "Fisika"]) {
    expect(quiz.body.questions.filter((question: { prompt: string }) => question.prompt.startsWith(`[${subject}]`))).toHaveLength(5);
  }
  expect(expectNoKeys(quiz.body, ["isCorrect", "acceptedAnswers", "correctAnswer", "explanation"])).toEqual([]);
  const definition = await api(owner, "GET", `/api/manage/quizzes/${seeded.quizId}`);
  expect(definition.body.readiness).toMatchObject({ ready: true, questionCount: 20, problems: [] });

  const started = await api(owner, "POST", `/api/student/quizzes/${seeded.quizId}/attempts`, {});
  expect(started.status).toBe(201);
  const correct = await db.select({ questionId: quizOption.questionId, selectedOptionId: quizOption.id })
    .from(quizOption).innerJoin(quizQuestion, eq(quizQuestion.id, quizOption.questionId))
    .where(and(eq(quizQuestion.quizId, seeded.quizId), eq(quizOption.isCorrect, true)));
  expect(correct).toHaveLength(20);
  const result = await api(owner, "POST", `/api/student/quiz-attempts/${started.body.id}/submit`, { answers: correct });
  expect(result.status).toBe(200);
  expect(result.body.score).toBe("100.00");
  const review = await api(owner, "GET", `/api/student/quizzes/${seeded.quizId}`);
  expect(review.body.questions.every((question: { explanation: string }) => Boolean(question.explanation))).toBe(true);
});

test("rerunning the seed preserves teacher edits, uploaded PDFs, and an existing quiz attempt", async () => {
  const owner = await newUser("mipa-preserve");
  const seeded = await seedScienceCourse(owner.id);
  const view = await api(owner, "GET", `/api/student/courses/${seeded.courseId}`);
  const lessonId = view.body.modules[0].lessons[0].id as string;
  const edited = await api(owner, "PATCH", `/api/manage/lessons/${lessonId}`, { content: "Gambaran materi yang sudah saya revisi." });
  expect(edited.status).toBe(200);
  const pdf = makePdf("PDF milik pengajar");
  const upload = await multipart(owner, "POST", `/api/manage/lessons/${lessonId}/resources/upload`, {
    title: "Materi tambahan", file: { name: "materi.pdf", bytes: pdf },
  });
  expect(upload.status).toBe(201);
  const started = await api(owner, "POST", `/api/student/quizzes/${seeded.quizId}/attempts`, {});
  expect(started.status).toBe(201);

  expect(await seedScienceCourse(owner.id)).toEqual({ ...seeded, created: false });
  expect((await api(owner, "GET", `/api/student/lessons/${lessonId}`)).body.content).toBe("Gambaran materi yang sudah saya revisi.");
  const resources = await db.select().from(learningResource).where(eq(learningResource.lessonId, lessonId));
  expect(resources).toHaveLength(1);
  expect(resources[0]!.id).toBe(upload.body.id);
  const file = await download(owner, `/api/student/resources/${upload.body.id}/file`);
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
  const attempts = await db.select().from(quizAttempt).where(eq(quizAttempt.quizId, seeded.quizId));
  expect(attempts).toHaveLength(1);
  expect(attempts[0]!.id).toBe(started.body.id);
  expect(attempts[0]!.status).toBe("in_progress");
  expect(await db.select().from(course).where(eq(course.id, seeded.courseId))).toHaveLength(1);
  expect(await db.select().from(quizQuestion).where(eq(quizQuestion.quizId, seeded.quizId))).toHaveLength(20);
});

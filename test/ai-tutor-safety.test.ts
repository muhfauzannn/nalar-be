import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";

import { db } from "../src/database/client";
import { courseMembership, quizAttempt } from "../src/database/schema";
import { findOrCreateTutorConversation } from "../src/modules/ai-tutor/ai-tutor.repository";
import { tutorSessionLimiter } from "../src/modules/ai-tutor/ai-tutor.service";
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

describe("the tutor prompt can never contain an answer key", () => {
  // The system instruction is built only from what these queries return. Quiz
  // content now comes from arbitrary users, so the rule must hold structurally:
  // the query layer must not even be able to read the key or the explanation.
  test("ai-tutor.repository.ts never selects isCorrect, acceptedAnswers or explanation", () => {
    const source = readFileSync("src/modules/ai-tutor/ai-tutor.repository.ts", "utf8");
    expect(source).not.toMatch(/isCorrect|acceptedAnswers|explanation\b/);
  });
});

describe("tutor sessions are rate limited per account", () => {
  test("30 sessions in a window are allowed (to the next check), the 31st is refused", async () => {
    const user = await newUser("tutor-user");
    tutorSessionLimiter.reset(user.id);
    const body = { targetType: "assignment", targetId: crypto.randomUUID(), mode: "hint" };

    for (let index = 0; index < 30; index += 1) {
      const reply = await api(user, "POST", "/api/student/ai-tutor/sessions", body);
      // No OpenAI key in tests: configuration error, but never a rate-limit error yet.
      expect(reply.status).toBe(503);
      expect(reply.body.code).toBe("AI_TUTOR_UNAVAILABLE");
    }
    const refused = await api(user, "POST", "/api/student/ai-tutor/sessions", body);
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("AI_TUTOR_RATE_LIMITED");

    // per account, not global
    const other = await newUser("tutor-other");
    const fine = await api(other, "POST", "/api/student/ai-tutor/sessions", body);
    expect(fine.status).toBe(503);
    tutorSessionLimiter.reset(user.id);
  });
});

async function twoStudentsInAuthoredCourse() {
  const teacher = await newUser("teacher");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const [alice, bob] = await Promise.all([newUser("alice"), newUser("bob")]);
  await joinCourse(alice, course.joinCode);
  await joinCourse(bob, course.joinCode);
  return { teacher, course, alice, bob };
}

const messagesOf = (client: Client, conversationId: string) =>
  api(client, "GET", `/api/student/ai-tutor/conversations/${conversationId}/messages`);

describe("tutor conversations belong to the student whose work they are about", () => {
  test("another student of the SAME authored course cannot read an assignment conversation", async () => {
    const { teacher, course, alice, bob } = await twoStudentsInAuthoredCourse();
    const scenario = await makeScenario();
    const created = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, { scenarioId: scenario.id });
    await api(teacher, "PATCH", `/api/manage/assignments/${created.body.id}`, { status: "published" });

    const started = await api(alice, "POST", `/api/student/assignments/${created.body.id}/submissions`, {});
    expect(started.status).toBe(201);
    const conversation = await findOrCreateTutorConversation({ submissionId: started.body.id });

    expect((await messagesOf(alice, conversation!.id)).status).toBe(200);
    const intruder = await messagesOf(bob, conversation!.id);
    expect(intruder.status).toBe(404);
    // ... and the course's own teacher is not a student of it either
    expect((await messagesOf(teacher, conversation!.id)).status).toBe(404);
  });

  test("the same for a quiz-attempt conversation", async () => {
    const { teacher, course, alice, bob } = await twoStudentsInAuthoredCourse();
    const quiz = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, { title: "K" });
    await api(teacher, "POST", `/api/manage/quizzes/${quiz.body.id}/questions`, multipleChoice());
    await api(teacher, "PATCH", `/api/manage/quizzes/${quiz.body.id}`, { status: "published" });
    const attempt = await api(alice, "POST", `/api/student/quizzes/${quiz.body.id}/attempts`, {});
    expect(attempt.status).toBe(201);

    const [row] = await db
      .select({ id: quizAttempt.id })
      .from(quizAttempt)
      .innerJoin(courseMembership, eq(courseMembership.id, quizAttempt.studentCourseMembershipId))
      .where(and(eq(quizAttempt.quizId, quiz.body.id), eq(courseMembership.userId, alice.id)));
    const conversation = await findOrCreateTutorConversation({ quizAttemptId: row!.id });

    expect((await messagesOf(alice, conversation!.id)).status).toBe(200);
    expect((await messagesOf(bob, conversation!.id)).status).toBe(404);
    expect((await messagesOf(teacher, conversation!.id)).status).toBe(404);
  });
});

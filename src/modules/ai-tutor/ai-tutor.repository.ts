import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
  assignment,
  course,
  courseMembership,
  promptClassification,
  quiz,
  quizAttempt,
  quizOption,
  quizQuestion,
  rubricCriterion,
  stageArtifact,
  submission,
  tutorConversation,
  tutorMessage,
} from "../../database/schema";

export type TutorMode = "hint" | "feedback";
export type PromptIntent =
  | "direct_answer"
  | "explanation_hint"
  | "reflective_evaluative";

export async function findAssignmentTutorTarget(userId: string, submissionId: string) {
  const [target] = await db
    .select({
      submissionId: submission.id,
      submissionStatus: submission.status,
      currentStage: submission.currentStage,
      assignmentId: assignment.id,
      rubricId: assignment.rubricId,
      assignmentTitle: assignment.title,
      instructions: assignment.instructions,
      assignmentStatus: assignment.status,
      closesAt: assignment.closesAt,
      courseName: course.name,
      enrollmentStatus: courseMembership.status,
    })
    .from(submission)
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .innerJoin(course, eq(course.id, assignment.courseId))
    .innerJoin(
      courseMembership,
      eq(courseMembership.id, submission.studentCourseMembershipId),
    )
    .where(
      and(
        eq(submission.id, submissionId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.courseId, assignment.courseId),
      ),
    )
    .limit(1);

  if (!target) return null;

  const independentArtifact = await db
    .select({ content: stageArtifact.content })
    .from(stageArtifact)
    .where(
      and(
        eq(stageArtifact.submissionId, submissionId),
        eq(stageArtifact.stage, "1_independent_effort"),
        eq(stageArtifact.isFinal, true),
      ),
    )
    .limit(1);

  const resolvedCriteria = await db
    .select({
      label: rubricCriterion.label,
      description: rubricCriterion.description,
    })
    .from(rubricCriterion)
    .where(eq(rubricCriterion.rubricId, target.rubricId))
    .orderBy(asc(rubricCriterion.position));

  return {
    ...target,
    criteria: resolvedCriteria,
    independentWork: independentArtifact[0]?.content ?? null,
  };
}

export async function findQuizTutorTarget(
  userId: string,
  attemptId: string,
  questionId?: string,
) {
  const [target] = await db
    .select({
      attemptId: quizAttempt.id,
      attemptStatus: quizAttempt.status,
      startedAt: quizAttempt.startedAt,
      quizId: quiz.id,
      quizTitle: quiz.title,
      instructions: quiz.instructions,
      quizStatus: quiz.status,
      closesAt: quiz.closesAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      courseName: course.name,
      enrollmentStatus: courseMembership.status,
    })
    .from(quizAttempt)
    .innerJoin(quiz, eq(quiz.id, quizAttempt.quizId))
    .innerJoin(course, eq(course.id, quiz.courseId))
    .innerJoin(
      courseMembership,
      eq(courseMembership.id, quizAttempt.studentCourseMembershipId),
    )
    .where(
      and(
        eq(quizAttempt.id, attemptId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.courseId, quiz.courseId),
      ),
    )
    .limit(1);

  if (!target) return null;
  if (!questionId) return { ...target, question: null, options: [] };

  const [question] = await db
    .select({
      id: quizQuestion.id,
      type: quizQuestion.type,
      prompt: quizQuestion.prompt,
      position: quizQuestion.position,
    })
    .from(quizQuestion)
    .where(
      and(eq(quizQuestion.id, questionId), eq(quizQuestion.quizId, target.quizId)),
    )
    .limit(1);

  if (!question) return { ...target, question: null, options: [] };

  const options =
    question.type === "multiple_choice"
      ? await db
          .select({
            id: quizOption.id,
            label: quizOption.label,
            position: quizOption.position,
          })
          .from(quizOption)
          .where(eq(quizOption.questionId, question.id))
          .orderBy(asc(quizOption.position))
      : [];

  return { ...target, question, options };
}

export async function findAssignmentTutorTurnAccess(
  userId: string,
  conversationId: string,
) {
  const [access] = await db
    .select({
      conversationId: tutorConversation.id,
      submissionId: submission.id,
      submissionStatus: submission.status,
      currentStage: submission.currentStage,
      assignmentStatus: assignment.status,
      closesAt: assignment.closesAt,
      enrollmentStatus: courseMembership.status,
    })
    .from(tutorConversation)
    .innerJoin(submission, eq(submission.id, tutorConversation.submissionId))
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .innerJoin(
      courseMembership,
      eq(courseMembership.id, submission.studentCourseMembershipId),
    )
    .where(
      and(
        eq(tutorConversation.id, conversationId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.courseId, assignment.courseId),
      ),
    )
    .limit(1);

  return access ?? null;
}

export async function findQuizTutorTurnAccess(
  userId: string,
  conversationId: string,
  questionId: string,
) {
  const [access] = await db
    .select({
      conversationId: tutorConversation.id,
      attemptId: quizAttempt.id,
      attemptStatus: quizAttempt.status,
      startedAt: quizAttempt.startedAt,
      quizStatus: quiz.status,
      closesAt: quiz.closesAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      enrollmentStatus: courseMembership.status,
      questionId: quizQuestion.id,
    })
    .from(tutorConversation)
    .innerJoin(quizAttempt, eq(quizAttempt.id, tutorConversation.quizAttemptId))
    .innerJoin(quiz, eq(quiz.id, quizAttempt.quizId))
    .innerJoin(
      courseMembership,
      eq(courseMembership.id, quizAttempt.studentCourseMembershipId),
    )
    .innerJoin(
      quizQuestion,
      and(eq(quizQuestion.id, questionId), eq(quizQuestion.quizId, quiz.id)),
    )
    .where(
      and(
        eq(tutorConversation.id, conversationId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.courseId, quiz.courseId),
      ),
    )
    .limit(1);

  return access ?? null;
}

export async function findOrCreateTutorConversation(target: {
  submissionId?: string;
  quizAttemptId?: string;
}) {
  const condition = target.submissionId
    ? eq(tutorConversation.submissionId, target.submissionId)
    : target.quizAttemptId
      ? eq(tutorConversation.quizAttemptId, target.quizAttemptId)
      : null;
  if (!condition) throw new Error("Tutor conversation target is required");
  const [existing] = await db
    .select()
    .from(tutorConversation)
    .where(condition)
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(tutorConversation)
    .values(target)
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [concurrent] = await db
    .select()
    .from(tutorConversation)
    .where(condition)
    .limit(1);
  return concurrent ?? null;
}

export async function findTutorConversation(conversationId: string) {
  const [conversation] = await db
    .select()
    .from(tutorConversation)
    .where(eq(tutorConversation.id, conversationId))
    .limit(1);
  return conversation ?? null;
}

export async function listTutorMessages(conversationId: string) {
  return db
    .select({
      id: tutorMessage.id,
      clientEventId: tutorMessage.clientEventId,
      author: tutorMessage.author,
      content: tutorMessage.content,
      mode: tutorMessage.mode,
      wasRedirected: tutorMessage.wasRedirected,
      modelVersion: tutorMessage.modelVersion,
      quizQuestionId: tutorMessage.quizQuestionId,
      sequence: tutorMessage.sequence,
      createdAt: tutorMessage.createdAt,
      intent: promptClassification.intent,
    })
    .from(tutorMessage)
    .leftJoin(
      promptClassification,
      eq(promptClassification.messageId, tutorMessage.id),
    )
    .where(eq(tutorMessage.conversationId, conversationId))
    .orderBy(asc(tutorMessage.sequence));
}

export async function saveClassifiedStudentMessage(input: {
  conversationId: string;
  clientEventId: string;
  quizQuestionId?: string;
  content: string;
  mode: TutorMode;
  intent: PromptIntent;
  confidence: number;
  isFallback: boolean;
  classifierVersion: string;
}) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from ${tutorConversation} where ${tutorConversation.id} = ${input.conversationId} for update`,
    );
    const [existing] = await transaction
      .select({
        id: tutorMessage.id,
        intent: promptClassification.intent,
        confidence: promptClassification.confidence,
        isFallback: promptClassification.isFallback,
      })
      .from(tutorMessage)
      .innerJoin(
        promptClassification,
        eq(promptClassification.messageId, tutorMessage.id),
      )
      .where(
        and(
          eq(tutorMessage.conversationId, input.conversationId),
          eq(tutorMessage.clientEventId, input.clientEventId),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const rows = await transaction.execute<{
      id: string;
      intent: PromptIntent;
      confidence: string;
      isFallback: boolean;
    }>(sql`
      with next_sequence as (
        select coalesce(max(${tutorMessage.sequence}), 0)::int + 1 as sequence_value
        from ${tutorMessage}
        where ${tutorMessage.conversationId} = ${input.conversationId}
      ), inserted_message as (
        insert into ${tutorMessage} (
          ${sql.identifier("conversation_id")},
          ${sql.identifier("client_event_id")},
          ${sql.identifier("quiz_question_id")},
          ${sql.identifier("author")},
          ${sql.identifier("content")},
          ${sql.identifier("mode")},
          ${sql.identifier("sequence")}
        )
        select
          ${input.conversationId},
          ${input.clientEventId},
          ${input.quizQuestionId ?? null},
          'student',
          ${input.content},
          ${input.mode},
          next_sequence.sequence_value
        from next_sequence
        returning ${tutorMessage.id}
      ), inserted_classification as (
        insert into ${promptClassification} (
          ${sql.identifier("message_id")},
          ${sql.identifier("intent")},
          ${sql.identifier("confidence")},
          ${sql.identifier("is_fallback")},
          ${sql.identifier("classifier_version")}
        )
        select
          inserted_message.id,
          ${input.intent},
          ${input.confidence.toFixed(3)},
          ${input.isFallback},
          ${input.classifierVersion}
        from inserted_message
        returning
          ${promptClassification.messageId},
          ${promptClassification.intent},
          ${promptClassification.confidence},
          ${promptClassification.isFallback}
      )
      select
        inserted_message.id as id,
        inserted_classification.intent as intent,
        inserted_classification.confidence as confidence,
        inserted_classification.is_fallback as "isFallback"
      from inserted_message
      inner join inserted_classification
        on inserted_classification.message_id = inserted_message.id
    `);
    const created = rows[0];
    if (!created) throw new Error("Failed to persist tutor student message");
    return created;
  });
}

export async function findClassifiedStudentEvent(
  conversationId: string,
  clientEventId: string,
) {
  const [row] = await db
    .select({
      id: tutorMessage.id,
      intent: promptClassification.intent,
    })
    .from(tutorMessage)
    .innerJoin(promptClassification, eq(promptClassification.messageId, tutorMessage.id))
    .where(
      and(
        eq(tutorMessage.conversationId, conversationId),
        eq(tutorMessage.clientEventId, clientEventId),
        eq(tutorMessage.author, "student"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function saveTutorReply(input: {
  conversationId: string;
  clientEventId: string;
  quizQuestionId?: string;
  content: string;
  mode: TutorMode;
  wasRedirected: boolean;
  modelVersion: string;
}) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from ${tutorConversation} where ${tutorConversation.id} = ${input.conversationId} for update`,
    );
    const [existing] = await transaction
      .select({ id: tutorMessage.id })
      .from(tutorMessage)
      .where(
        and(
          eq(tutorMessage.conversationId, input.conversationId),
          eq(tutorMessage.clientEventId, input.clientEventId),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const rows = await transaction.execute<{ id: string }>(sql`
      with next_sequence as (
        select coalesce(max(${tutorMessage.sequence}), 0)::int + 1 as sequence_value
        from ${tutorMessage}
        where ${tutorMessage.conversationId} = ${input.conversationId}
      )
      insert into ${tutorMessage} (
        ${sql.identifier("conversation_id")},
        ${sql.identifier("client_event_id")},
        ${sql.identifier("quiz_question_id")},
        ${sql.identifier("author")},
        ${sql.identifier("content")},
        ${sql.identifier("mode")},
        ${sql.identifier("was_redirected")},
        ${sql.identifier("model_version")},
        ${sql.identifier("sequence")}
      )
      select
        ${input.conversationId},
        ${input.clientEventId},
        ${input.quizQuestionId ?? null},
        'tutor',
        ${input.content},
        ${input.mode},
        ${input.wasRedirected},
        ${input.modelVersion},
        next_sequence.sequence_value
      from next_sequence
      returning ${tutorMessage.id} as id
    `);
    const created = rows[0];
    return created ?? null;
  });
}

import { and, asc, eq } from "drizzle-orm";

import { db } from "../../database/client";
import {
  assignment,
  course,
  explanationFactor,
  offloadingIndexResult,
  promptClassification,
  quiz,
  quizAttempt,
  quizUsageReflection,
  rubricCriterion,
  stageArtifact,
  submission,
  tutorConversation,
  tutorMessage,
} from "../../database/schema";

export type PromptIntent =
  | "direct_answer"
  | "explanation_hint"
  | "reflective_evaluative";
export type OffloadingLevel =
  | "1_ai_as_tool"
  | "2_ai_as_scaffold"
  | "3_partial_offloading"
  | "4_full_offloading";
export type AiRelianceLevel = "none" | "low" | "moderate" | "high";

export type OffloadingRow = typeof offloadingIndexResult.$inferSelect;
export type ExplanationFactorRow = typeof explanationFactor.$inferSelect;
export type QuizReflectionRow = typeof quizUsageReflection.$inferSelect;

export type SubmissionAnalysisContext = {
  assignmentTitle: string;
  instructions: string;
  courseName: string;
  criteria: Array<{ label: string; description: string }>;
  artifacts: {
    independentEffort: string | null;
    aiEvaluation: string | null;
    finalAnswer: string | null;
    reflection: string | null;
  };
  tutorTurns: Array<{ content: string; intent: PromptIntent }>;
};

export type QuizAnalysisContext = {
  quizTitle: string;
  instructions: string | null;
  courseName: string;
  tutorTurns: Array<{ content: string; intent: PromptIntent }>;
};

export async function findSubmissionAnalysisContext(
  submissionId: string,
): Promise<SubmissionAnalysisContext | null> {
  const [meta] = await db
    .select({
      assignmentTitle: assignment.title,
      instructions: assignment.instructions,
      rubricId: assignment.rubricId,
      courseName: course.name,
    })
    .from(submission)
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .innerJoin(course, eq(course.id, assignment.courseId))
    .where(eq(submission.id, submissionId))
    .limit(1);
  if (!meta) return null;

  const [criteria, artifacts, tutorTurns] = await Promise.all([
    db
      .select({
        label: rubricCriterion.label,
        description: rubricCriterion.description,
      })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.rubricId, meta.rubricId))
      .orderBy(asc(rubricCriterion.position)),
    db
      .select({ stage: stageArtifact.stage, content: stageArtifact.content })
      .from(stageArtifact)
      .where(
        and(
          eq(stageArtifact.submissionId, submissionId),
          eq(stageArtifact.isFinal, true),
        ),
      ),
    listStudentTutorTurns({ submissionId }),
  ]);

  const byStage = new Map(artifacts.map((row) => [row.stage, row.content]));
  return {
    assignmentTitle: meta.assignmentTitle,
    instructions: meta.instructions,
    courseName: meta.courseName,
    criteria,
    artifacts: {
      independentEffort: byStage.get("1_independent_effort") ?? null,
      aiEvaluation: byStage.get("3_ai_evaluation") ?? null,
      finalAnswer: byStage.get("4_revision_finalization") ?? null,
      reflection: byStage.get("5_reflection") ?? null,
    },
    tutorTurns,
  };
}

export async function findQuizAnalysisContext(
  attemptId: string,
): Promise<QuizAnalysisContext | null> {
  const [meta] = await db
    .select({
      quizTitle: quiz.title,
      instructions: quiz.instructions,
      courseName: course.name,
    })
    .from(quizAttempt)
    .innerJoin(quiz, eq(quiz.id, quizAttempt.quizId))
    .innerJoin(course, eq(course.id, quiz.courseId))
    .where(eq(quizAttempt.id, attemptId))
    .limit(1);
  if (!meta) return null;

  return {
    quizTitle: meta.quizTitle,
    instructions: meta.instructions,
    courseName: meta.courseName,
    tutorTurns: await listStudentTutorTurns({ quizAttemptId: attemptId }),
  };
}

async function listStudentTutorTurns(target: {
  submissionId?: string;
  quizAttemptId?: string;
}) {
  const condition = target.submissionId
    ? eq(tutorConversation.submissionId, target.submissionId)
    : eq(tutorConversation.quizAttemptId, target.quizAttemptId as string);
  return db
    .select({
      content: tutorMessage.content,
      intent: promptClassification.intent,
    })
    .from(tutorConversation)
    .innerJoin(tutorMessage, eq(tutorMessage.conversationId, tutorConversation.id))
    .innerJoin(
      promptClassification,
      eq(promptClassification.messageId, tutorMessage.id),
    )
    .where(and(condition, eq(tutorMessage.author, "student")))
    .orderBy(asc(tutorMessage.sequence));
}

export async function getSubmissionOffloadingRow(submissionId: string) {
  const [result] = await db
    .select()
    .from(offloadingIndexResult)
    .where(eq(offloadingIndexResult.submissionId, submissionId))
    .limit(1);
  if (!result) return null;
  const factors = await db
    .select()
    .from(explanationFactor)
    .where(eq(explanationFactor.resultId, result.id))
    .orderBy(asc(explanationFactor.createdAt));
  return { result, factors };
}

export async function saveSubmissionOffloading(input: {
  submissionId: string;
  level: OffloadingLevel;
  score: string;
  intentInput: string;
  effortInput: string;
  studentReport: string;
  recommendations: string[];
  scoringVersion: string;
  factors: Array<{
    factor: string;
    contribution: string;
    plainExplanation: string;
  }>;
}) {
  return db.transaction(async (transaction) => {
    const [inserted] = await transaction
      .insert(offloadingIndexResult)
      .values({
        submissionId: input.submissionId,
        level: input.level,
        score: input.score,
        intentInput: input.intentInput,
        effortInput: input.effortInput,
        studentReport: input.studentReport,
        recommendations: input.recommendations,
        scoringVersion: input.scoringVersion,
        computedAt: new Date(),
      })
      .onConflictDoNothing({ target: offloadingIndexResult.submissionId })
      .returning();
    if (inserted) {
      if (input.factors.length > 0) {
        await transaction.insert(explanationFactor).values(
          input.factors.map((factor) => ({
            resultId: inserted.id,
            factor: factor.factor,
            contribution: factor.contribution,
            plainExplanation: factor.plainExplanation,
          })),
        );
      }
      const factors = await transaction
        .select()
        .from(explanationFactor)
        .where(eq(explanationFactor.resultId, inserted.id))
        .orderBy(asc(explanationFactor.createdAt));
      return { result: inserted, factors };
    }

    const [existing] = await transaction
      .select()
      .from(offloadingIndexResult)
      .where(eq(offloadingIndexResult.submissionId, input.submissionId))
      .limit(1);
    if (!existing) return null;
    const factors = await transaction
      .select()
      .from(explanationFactor)
      .where(eq(explanationFactor.resultId, existing.id))
      .orderBy(asc(explanationFactor.createdAt));
    return { result: existing, factors };
  });
}

export async function getQuizReflectionRow(attemptId: string) {
  const [row] = await db
    .select()
    .from(quizUsageReflection)
    .where(eq(quizUsageReflection.quizAttemptId, attemptId))
    .limit(1);
  return row ?? null;
}

export async function saveQuizReflection(input: {
  quizAttemptId: string;
  relianceLevel: AiRelianceLevel;
  studentReport: string;
  recommendations: string[];
  promptTurnCount: number;
  directCount: number;
  hintCount: number;
  reflectiveCount: number;
  redirectedCount: number;
  scoringVersion: string;
}) {
  const [inserted] = await db
    .insert(quizUsageReflection)
    .values({ ...input, computedAt: new Date() })
    .onConflictDoNothing({ target: quizUsageReflection.quizAttemptId })
    .returning();
  if (inserted) return inserted;
  return getQuizReflectionRow(input.quizAttemptId);
}

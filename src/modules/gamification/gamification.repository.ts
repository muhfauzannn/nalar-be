import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "../../database/client";
import {
  assignment,
  courseMembership,
  processPointEvent,
  promptClassification,
  stageArtifact,
  stageProgress,
  submission,
  tutorConversation,
  tutorMessage,
  writingSignal,
} from "../../database/schema";
import { POINT_RULE_VERSION, type PointAward } from "./process-points.rules";

// Reads for Poin Nalar and the island map. By design nothing here touches the
// AI Offloading Index tables (offloading_index_result, explanation_factor):
// test/process-points.test.ts fails if this module ever imports them.

export async function findPointInputs(submissionId: string) {
  const [owner] = await db
    .select({ membershipId: submission.studentCourseMembershipId })
    .from(submission)
    .where(eq(submission.id, submissionId))
    .limit(1);
  if (!owner) return null;

  const [stages, artifacts, signals, intents] = await Promise.all([
    db
      .select({ stage: stageProgress.stage })
      .from(stageProgress)
      .where(and(eq(stageProgress.submissionId, submissionId), eq(stageProgress.status, "completed"))),
    db
      .select({ stage: stageArtifact.stage, content: stageArtifact.content })
      .from(stageArtifact)
      .where(and(eq(stageArtifact.submissionId, submissionId), eq(stageArtifact.isFinal, true))),
    db
      .select({
        stage: writingSignal.stage,
        pastedChars: writingSignal.pastedChars,
        finalChars: writingSignal.finalChars,
      })
      .from(writingSignal)
      .where(eq(writingSignal.submissionId, submissionId)),
    db
      .select({ intent: promptClassification.intent })
      .from(tutorConversation)
      .innerJoin(tutorMessage, eq(tutorMessage.conversationId, tutorConversation.id))
      .innerJoin(promptClassification, eq(promptClassification.messageId, tutorMessage.id))
      .where(and(eq(tutorConversation.submissionId, submissionId), eq(tutorMessage.author, "student"))),
  ]);
  return { membershipId: owner.membershipId, stages, artifacts, signals, intents };
}

export async function insertPointAwards(submissionId: string, membershipId: string, awards: PointAward[]) {
  if (awards.length === 0) return [];
  return db
    .insert(processPointEvent)
    .values(
      awards.map((award) => ({
        submissionId,
        studentCourseMembershipId: membershipId,
        kind: award.kind,
        stage: award.stage,
        points: award.points,
        ruleVersion: POINT_RULE_VERSION,
      })),
    )
    .onConflictDoNothing()
    .returning({ kind: processPointEvent.kind, stage: processPointEvent.stage, points: processPointEvent.points });
}

export async function listIslandAssignments(courseId: string) {
  return db
    .select({
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      dueAt: assignment.dueAt,
    })
    .from(assignment)
    .where(and(eq(assignment.courseId, courseId), inArray(assignment.status, ["published", "closed"])))
    .orderBy(asc(assignment.dueAt), asc(assignment.createdAt));
}

export async function listMembershipSubmissions(membershipIds: string[]) {
  if (membershipIds.length === 0) return [];
  return db
    .select({
      id: submission.id,
      assignmentId: submission.assignmentId,
      membershipId: submission.studentCourseMembershipId,
      attemptNumber: submission.attemptNumber,
      status: submission.status,
      currentStage: submission.currentStage,
      submittedAt: submission.submittedAt,
    })
    .from(submission)
    .where(inArray(submission.studentCourseMembershipId, membershipIds));
}

export async function listStageStates(submissionIds: string[]) {
  if (submissionIds.length === 0) return [];
  return db
    .select({ submissionId: stageProgress.submissionId, stage: stageProgress.stage, status: stageProgress.status })
    .from(stageProgress)
    .where(inArray(stageProgress.submissionId, submissionIds));
}

export async function listStageCompletions(submissionIds: string[]) {
  if (submissionIds.length === 0) return [];
  return db
    .select({ submissionId: stageProgress.submissionId, completedAt: stageProgress.completedAt })
    .from(stageProgress)
    .where(and(inArray(stageProgress.submissionId, submissionIds), eq(stageProgress.status, "completed")));
}

export async function listPointEvents(membershipIds: string[]) {
  if (membershipIds.length === 0) return [];
  return db
    .select({
      id: processPointEvent.id,
      submissionId: processPointEvent.submissionId,
      membershipId: processPointEvent.studentCourseMembershipId,
      kind: processPointEvent.kind,
      stage: processPointEvent.stage,
      points: processPointEvent.points,
      createdAt: processPointEvent.createdAt,
      assignmentId: submission.assignmentId,
      assignmentTitle: assignment.title,
    })
    .from(processPointEvent)
    .innerJoin(submission, eq(submission.id, processPointEvent.submissionId))
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .where(inArray(processPointEvent.studentCourseMembershipId, membershipIds))
    .orderBy(desc(processPointEvent.createdAt));
}

// The class for the shared bridge: active students, not the course's teachers.
export async function listClassMemberships(courseId: string) {
  const teachers = db
    .select({ userId: courseMembership.userId })
    .from(courseMembership)
    .where(and(eq(courseMembership.courseId, courseId), eq(courseMembership.role, "teacher")));
  return db
    .select({ id: courseMembership.id })
    .from(courseMembership)
    .where(
      and(
        eq(courseMembership.courseId, courseId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.status, "active"),
        notInArray(courseMembership.userId, teachers),
      ),
    );
}

export async function listStudentMemberships(userId: string) {
  return db
    .select({ id: courseMembership.id, courseId: courseMembership.courseId })
    .from(courseMembership)
    .where(
      and(
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    );
}

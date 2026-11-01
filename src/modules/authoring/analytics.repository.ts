import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "../../database/client";
import {
  assignment,
  course,
  courseMembership,
  explanationFactor,
  offloadingIndexResult,
  promptClassification,
  stageArtifact,
  stageProgress,
  submission,
  tutorConversation,
  tutorMessage,
  user,
  writingSignal,
} from "../../database/schema";

// Teacher-side reads of the learning process. Everything here is the same
// learning log the AI Offloading Index is computed from (PRD §9 "satu sumber
// data"): nothing is re-scored, only gathered for the teacher.

export async function findAssignmentMeta(assignmentId: string) {
  const [row] = await db
    .select({
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      dueAt: assignment.dueAt,
      courseId: assignment.courseId,
      courseName: course.name,
    })
    .from(assignment)
    .innerJoin(course, eq(course.id, assignment.courseId))
    .where(eq(assignment.id, assignmentId))
    .limit(1);
  return row ?? null;
}

// A course's teachers are also enrolled as students of it (to preview it as a
// student), so they are left out: the class is the students who are only students.
export async function listActiveStudents(courseId: string) {
  const teachers = db
    .select({ userId: courseMembership.userId })
    .from(courseMembership)
    .where(and(eq(courseMembership.courseId, courseId), eq(courseMembership.role, "teacher")));
  return db
    .select({ membershipId: courseMembership.id, name: user.name })
    .from(courseMembership)
    .innerJoin(user, eq(user.id, courseMembership.userId))
    .where(
      and(
        eq(courseMembership.courseId, courseId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.status, "active"),
        notInArray(courseMembership.userId, teachers),
      ),
    )
    .orderBy(asc(user.name));
}

export async function listAssignmentSubmissions(assignmentId: string) {
  return db
    .select({
      id: submission.id,
      membershipId: submission.studentCourseMembershipId,
      attemptNumber: submission.attemptNumber,
      status: submission.status,
      currentStage: submission.currentStage,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
    })
    .from(submission)
    .where(eq(submission.assignmentId, assignmentId));
}

export async function countCompletedStages(submissionIds: string[]) {
  if (submissionIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ submissionId: stageProgress.submissionId })
    .from(stageProgress)
    .where(
      and(
        inArray(stageProgress.submissionId, submissionIds),
        eq(stageProgress.status, "completed"),
      ),
    );
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.submissionId, (counts.get(row.submissionId) ?? 0) + 1);
  return counts;
}

// Every Index result of the course's students, oldest first, so a student's
// trend and "previous score" come from the same rows.
export async function listCourseOffloading(courseId: string, membershipIds?: string[]) {
  if (membershipIds && membershipIds.length === 0) return [];
  return db
    .select({
      resultId: offloadingIndexResult.id,
      submissionId: offloadingIndexResult.submissionId,
      membershipId: submission.studentCourseMembershipId,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      level: offloadingIndexResult.level,
      score: offloadingIndexResult.score,
      submittedAt: submission.submittedAt,
      computedAt: offloadingIndexResult.computedAt,
    })
    .from(offloadingIndexResult)
    .innerJoin(submission, eq(submission.id, offloadingIndexResult.submissionId))
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .where(
      and(
        eq(assignment.courseId, courseId),
        membershipIds ? inArray(submission.studentCourseMembershipId, membershipIds) : undefined,
      ),
    )
    .orderBy(asc(submission.submittedAt), asc(offloadingIndexResult.computedAt));
}

export async function listFactors(resultIds: string[]) {
  if (resultIds.length === 0) return [];
  return db
    .select({
      resultId: explanationFactor.resultId,
      factor: explanationFactor.factor,
      contribution: explanationFactor.contribution,
      plainExplanation: explanationFactor.plainExplanation,
    })
    .from(explanationFactor)
    .where(inArray(explanationFactor.resultId, resultIds))
    .orderBy(desc(explanationFactor.contribution));
}

export async function findSubmissionForAssignment(assignmentId: string, submissionId: string) {
  const [row] = await db
    .select({
      id: submission.id,
      membershipId: submission.studentCourseMembershipId,
      attemptNumber: submission.attemptNumber,
      status: submission.status,
      currentStage: submission.currentStage,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      studentName: user.name,
    })
    .from(submission)
    .innerJoin(courseMembership, eq(courseMembership.id, submission.studentCourseMembershipId))
    .innerJoin(user, eq(user.id, courseMembership.userId))
    .where(and(eq(submission.id, submissionId), eq(submission.assignmentId, assignmentId)))
    .limit(1);
  return row ?? null;
}

export async function listStageProgress(submissionId: string) {
  return db
    .select({
      stage: stageProgress.stage,
      status: stageProgress.status,
      startedAt: stageProgress.startedAt,
      completedAt: stageProgress.completedAt,
    })
    .from(stageProgress)
    .where(eq(stageProgress.submissionId, submissionId));
}

export async function listArtifacts(submissionId: string) {
  return db
    .select({
      stage: stageArtifact.stage,
      content: stageArtifact.content,
      version: stageArtifact.version,
      isFinal: stageArtifact.isFinal,
      updatedAt: stageArtifact.updatedAt,
    })
    .from(stageArtifact)
    .where(eq(stageArtifact.submissionId, submissionId))
    .orderBy(asc(stageArtifact.stage), asc(stageArtifact.version));
}

export async function listTutorTranscript(submissionId: string) {
  return db
    .select({
      id: tutorMessage.id,
      author: tutorMessage.author,
      content: tutorMessage.content,
      mode: tutorMessage.mode,
      wasRedirected: tutorMessage.wasRedirected,
      intent: promptClassification.intent,
      createdAt: tutorMessage.createdAt,
    })
    .from(tutorConversation)
    .innerJoin(tutorMessage, eq(tutorMessage.conversationId, tutorConversation.id))
    .leftJoin(promptClassification, eq(promptClassification.messageId, tutorMessage.id))
    .where(eq(tutorConversation.submissionId, submissionId))
    .orderBy(asc(tutorMessage.sequence));
}

export async function listWritingSignals(submissionId: string) {
  return db
    .select({
      stage: writingSignal.stage,
      activeSeconds: writingSignal.activeSeconds,
      typedChars: writingSignal.typedChars,
      deletedChars: writingSignal.deletedChars,
      pasteCount: writingSignal.pasteCount,
      pastedChars: writingSignal.pastedChars,
      largestPaste: writingSignal.largestPaste,
      longPauses: writingSignal.longPauses,
      focusLosses: writingSignal.focusLosses,
      finalChars: writingSignal.finalChars,
    })
    .from(writingSignal)
    .where(eq(writingSignal.submissionId, submissionId));
}

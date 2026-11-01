import { findStudentCourse } from "../student/student.repository";
import {
  findPointInputs,
  insertPointAwards,
  listClassMemberships,
  listIslandAssignments,
  listMembershipSubmissions,
  listPointEvents,
  listStageStates,
  listStudentMemberships,
} from "./gamification.repository";
import {
  badgesFrom,
  evaluateProcessPoints,
  type ProcessPointKind,
  type Stage,
} from "./process-points.rules";

const STAGES: Stage[] = [
  "1_independent_effort",
  "2_guided_questioning",
  "3_ai_evaluation",
  "4_revision_finalization",
  "5_reflection",
];

export class GamificationError extends Error {
  readonly status = 404 as const;
}

// Award what the submission has earned so far. Idempotent: every kind is
// stored at most once per submission, so it is safe to call again.
export async function awardSubmissionPoints(submissionId: string) {
  const inputs = await findPointInputs(submissionId);
  if (!inputs) return [];
  const awards = evaluateProcessPoints({
    completedStages: inputs.stages.map((row) => row.stage),
    texts: Object.fromEntries(inputs.artifacts.map((row) => [row.stage, row.content])),
    writing: Object.fromEntries(inputs.signals.map((row) => [row.stage, row])),
    intents: inputs.intents.map((row) => row.intent),
  });
  return insertPointAwards(submissionId, inputs.membershipId, awards);
}

// Points never block the stage they come from.
export async function awardSubmissionPointsSafely(submissionId: string) {
  try {
    return await awardSubmissionPoints(submissionId);
  } catch (error) {
    console.error("process points failed", error);
    return [];
  }
}

const latestBy = <T extends { attemptNumber: number }>(rows: T[], key: (row: T) => string) => {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const seen = latest.get(key(row));
    if (!seen || row.attemptNumber > seen.attemptNumber) latest.set(key(row), row);
  }
  return latest;
};

function tally(events: Array<{ kind: ProcessPointKind; points: number }>) {
  const byKind: Partial<Record<ProcessPointKind, number>> = {};
  let total = 0;
  for (const event of events) {
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
    total += event.points;
  }
  return { total, byKind };
}

const eventView = (event: Awaited<ReturnType<typeof listPointEvents>>[number]) => ({
  id: event.id,
  kind: event.kind,
  stage: event.stage,
  points: event.points,
  assignmentId: event.assignmentId,
  assignmentTitle: event.assignmentTitle,
  at: event.createdAt.toISOString(),
});

// One course as an island: every assignment is a building reached through five
// posts (the five stages), with a chest that opens once the journey is done.
export async function getCourseIsland(userId: string, courseId: string) {
  const courseRow = await findStudentCourse(courseId, userId);
  if (!courseRow) throw new GamificationError("Course tidak ditemukan.");
  const membershipId = courseRow.enrollmentId;

  const [assignments, classMembers] = await Promise.all([
    listIslandAssignments(courseId),
    listClassMemberships(courseId),
  ]);
  const classIds = classMembers.map((row) => row.id);
  const submissions = await listMembershipSubmissions([...new Set([...classIds, membershipId])]);
  const assignmentIds = new Set(assignments.map((row) => row.id));
  const visible = submissions.filter((row) => assignmentIds.has(row.assignmentId));

  const mine = latestBy(
    visible.filter((row) => row.membershipId === membershipId),
    (row) => row.assignmentId,
  );
  // Backfill: work done before the ledger existed earns its points too.
  await Promise.all([...mine.values()].map((row) => awardSubmissionPoints(row.id)));

  const [states, events] = await Promise.all([
    listStageStates([...mine.values()].map((row) => row.id)),
    listPointEvents([membershipId]),
  ]);

  const buildings = assignments.map((item) => {
    const sub = mine.get(item.id) ?? null;
    const own = sub ? events.filter((event) => event.submissionId === sub.id) : [];
    const finished = sub?.status === "submitted" || sub?.status === "returned";
    return {
      assignmentId: item.id,
      title: item.title,
      dueAt: item.dueAt?.toISOString() ?? null,
      open: item.status === "published",
      submissionStatus: sub?.status ?? null,
      posts: STAGES.map((stage) => {
        const state = sub ? states.find((row) => row.submissionId === sub.id && row.stage === stage) : null;
        const status = state?.status === "completed" ? "done" : sub?.status === "in_progress" && sub.currentStage === stage ? "current" : "locked";
        return { stage, status, points: own.filter((event) => event.stage === stage).reduce((sum, event) => sum + event.points, 0) };
      }),
      chestOpen: finished,
      points: own.reduce((sum, event) => sum + event.points, 0),
    };
  });

  // The bridge is a class target: one plank for every finished journey. It
  // shows the class's progress together and never ranks anyone.
  const classLatest = latestBy(
    visible.filter((row) => classIds.includes(row.membershipId)),
    (row) => `${row.membershipId}:${row.assignmentId}`,
  );
  const planks = [...classLatest.values()].filter(
    (row) => row.status === "submitted" || row.status === "returned",
  ).length;

  const { total, byKind } = tally(events);
  return {
    course: { id: courseRow.id, name: courseRow.name, subjectName: courseRow.subjectName },
    points: { total },
    badges: badgesFrom(byKind),
    bridge: { planks, total: classIds.length * assignments.length, students: classIds.length },
    buildings,
    recent: events.slice(0, 6).map(eventView),
  };
}

// Poin Nalar across every course the student is in, for the dashboard.
export async function getStudentPoints(userId: string) {
  const memberships = await listStudentMemberships(userId);
  const ids = memberships.map((row) => row.id);
  const submissions = await listMembershipSubmissions(ids);
  const latest = latestBy(submissions, (row) => `${row.membershipId}:${row.assignmentId}`);
  await Promise.all([...latest.values()].map((row) => awardSubmissionPoints(row.id)));
  const events = await listPointEvents(ids);
  const { total, byKind } = tally(events);
  return {
    total,
    badges: badgesFrom(byKind),
    recent: events.slice(0, 5).map(eventView),
  };
}

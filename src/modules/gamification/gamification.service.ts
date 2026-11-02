import { findLab, LAB_CHALLENGE_POINTS } from "../labs/lab-catalog";
import { listCourseLabs, listLabCompletions } from "../labs/labs.repository";
import { findStudentCourse } from "../student/student.repository";
import {
  findPointInputs,
  insertPointAwards,
  listClassMemberships,
  listIslandAssignments,
  listMembershipSubmissions,
  listPointEvents,
  listStageCompletions,
  listStageStates,
  listStudentMemberships,
} from "./gamification.repository";
import {
  badgesFrom,
  evaluateProcessPoints,
  type ProcessPointKind,
  type Stage,
} from "./process-points.rules";
import { comebacks, isThisWeek, levelFrom, weeklyMissions, weeklyRhythm } from "./progression";

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

type SubmissionRow = Awaited<ReturnType<typeof listMembershipSubmissions>>[number];
type EventRow = Awaited<ReturnType<typeof listPointEvents>>[number];

// Finished assignments with the kinds of points they earned, for "Bangkit".
function journeysOf(submissions: SubmissionRow[], events: EventRow[]) {
  return submissions.flatMap((row) =>
    row.submittedAt
      ? [{
          membershipId: row.membershipId,
          finishedAt: row.submittedAt,
          kinds: events.filter((event) => event.submissionId === row.id).map((event) => event.kind),
        }]
      : [],
  );
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

  const [states, events, labs, solved] = await Promise.all([
    listStageStates([...mine.values()].map((row) => row.id)),
    listPointEvents([membershipId]),
    listCourseLabs(courseId),
    listLabCompletions([membershipId]),
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
        const earned = own.filter((event) => event.stage === stage);
        return {
          stage,
          status,
          points: earned.reduce((sum, event) => sum + event.points, 0),
          earned: earned.map((event) => event.kind),
        };
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
  const own = visible.filter((row) => row.membershipId === membershipId);
  const labIds = new Set(labs.map((lab) => lab.id));
  const labSolved = solved.filter((row) => labIds.has(row.lessonLabId));
  return {
    course: { id: courseRow.id, name: courseRow.name, subjectName: courseRow.subjectName },
    points: { total: total + labSolved.length * LAB_CHALLENGE_POINTS },
    labs: labs.map((lab) => ({
      id: lab.id,
      lessonId: lab.lessonId,
      labKey: lab.labKey,
      solved: labSolved.filter((row) => row.lessonLabId === lab.id).length,
      challenges: findLab(lab.labKey)?.challenges.length ?? 0,
    })),
    badges: badgesFrom(byKind, comebacks(journeysOf(own, events))),
    bridge: { planks, total: classIds.length * assignments.length, students: classIds.length },
    buildings,
    recent: events.slice(0, 6).map(eventView),
  };
}

// Poin Nalar across every course the student is in, with the level, the weekly
// rhythm and this week's missions, for the dashboard and the world map.
export async function getStudentProgress(userId: string) {
  const memberships = await listStudentMemberships(userId);
  const ids = memberships.map((row) => row.id);
  const submissions = await listMembershipSubmissions(ids);
  const latest = latestBy(submissions, (row) => `${row.membershipId}:${row.assignmentId}`);
  await Promise.all([...latest.values()].map((row) => awardSubmissionPoints(row.id)));
  const [events, completions, solved] = await Promise.all([
    listPointEvents(ids),
    listStageCompletions(submissions.map((row) => row.id)),
    listLabCompletions(ids),
  ]);
  const tallied = tally(events);
  const { byKind } = tallied;
  // Solved lab challenges add a small, fixed amount each (lab-catalog.ts).
  const total = tallied.total + solved.length * LAB_CHALLENGE_POINTS;
  const now = new Date();
  const completedAt = completions.flatMap((row) => (row.completedAt ? [row.completedAt] : []));
  return {
    total,
    level: levelFrom(total),
    week: weeklyRhythm(completedAt, now),
    missions: weeklyMissions(
      completedAt.filter((at) => isThisWeek(at, now)).length,
      events.filter((event) => isThisWeek(event.createdAt, now)),
    ),
    badges: badgesFrom(byKind, comebacks(journeysOf(submissions, events))),
    recent: events.slice(0, 5).map(eventView),
  };
}

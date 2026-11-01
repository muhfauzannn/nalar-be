import { getSubmissionOffloading } from "../ai-analysis/ai-analysis.service";
import type { OffloadingLevel } from "../ai-analysis/ai-analysis.repository";
import { notFound } from "./authoring.shared";
import { findTeacherAssignment } from "./assignment.repository";
import {
  countCompletedStages,
  findAssignmentMeta,
  findSubmissionForAssignment,
  listActiveStudents,
  listArtifacts,
  listAssignmentSubmissions,
  listCourseOffloading,
  listFactors,
  listStageProgress,
  listTutorTranscript,
  listWritingSignals,
} from "./analytics.repository";

const LEVELS: OffloadingLevel[] = [
  "1_ai_as_tool",
  "2_ai_as_scaffold",
  "3_partial_offloading",
  "4_full_offloading",
];
const STAGES = [
  "1_independent_effort",
  "2_guided_questioning",
  "3_ai_evaluation",
  "4_revision_finalization",
  "5_reflection",
] as const;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

// The class view of one assignment: who is where in the five stages, how the
// class spreads over the four Index levels, and which factors keep coming up.
export async function getAssignmentAnalytics(userId: string, assignmentId: string) {
  if (!(await findTeacherAssignment(userId, assignmentId))) throw notFound();
  const meta = await findAssignmentMeta(assignmentId);
  if (!meta) throw notFound();

  const [students, submissions] = await Promise.all([
    listActiveStudents(meta.courseId),
    listAssignmentSubmissions(assignmentId),
  ]);

  // A student may retry; the class view follows their latest attempt.
  const latest = new Map<string, (typeof submissions)[number]>();
  for (const row of submissions) {
    const seen = latest.get(row.membershipId);
    if (!seen || row.attemptNumber > seen.attemptNumber) latest.set(row.membershipId, row);
  }

  const membershipIds = students.map((student) => student.membershipId);
  const [completed, history] = await Promise.all([
    countCompletedStages([...latest.values()].map((row) => row.id)),
    listCourseOffloading(meta.courseId, membershipIds),
  ]);
  const bySubmission = new Map(history.map((row) => [row.submissionId, row]));
  const factors = await listFactors(
    [...latest.values()].flatMap((row) => bySubmission.get(row.id)?.resultId ?? []),
  );
  const factorsByResult = new Map<string, typeof factors>();
  for (const factor of factors) {
    factorsByResult.set(factor.resultId, [...(factorsByResult.get(factor.resultId) ?? []), factor]);
  }

  const distribution = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<OffloadingLevel, number>;
  const counts = { enrolled: students.length, notStarted: 0, inProgress: 0, submitted: 0, analyzed: 0 };
  const factorTally = new Map<string, { factor: string; students: number; contribution: number; strongest: number; example: string }>();

  const rows = students.map((student) => {
    const sub = latest.get(student.membershipId) ?? null;
    const status = sub?.status ?? "not_started";
    if (status === "not_started") counts.notStarted++;
    else if (status === "in_progress") counts.inProgress++;
    else counts.submitted++;

    const result = sub ? bySubmission.get(sub.id) ?? null : null;
    let offloading = null;
    if (result) {
      counts.analyzed++;
      distribution[result.level]++;
      const own = factorsByResult.get(result.resultId) ?? [];
      for (const factor of own) {
        const contribution = Number(factor.contribution);
        if (contribution <= 0) continue;
        const tally = factorTally.get(factor.factor) ?? { factor: factor.factor, students: 0, contribution: 0, strongest: 0, example: "" };
        tally.students++;
        tally.contribution += contribution;
        // Quote the student this factor weighed on most.
        if (contribution > tally.strongest) {
          tally.strongest = contribution;
          tally.example = factor.plainExplanation;
        }
        factorTally.set(factor.factor, tally);
      }
      // The student's previous result in this course, for the trend arrow.
      const earlier = history.filter(
        (row) => row.membershipId === student.membershipId && row.submissionId !== result.submissionId && row.computedAt < result.computedAt,
      );
      const previous = earlier.at(-1) ?? null;
      // The factor that moved the score most, whichever way it pushed.
      const top = [...own].sort((a, b) => Math.abs(Number(b.contribution)) - Math.abs(Number(a.contribution)))[0] ?? null;
      offloading = {
        level: result.level,
        score: Number(result.score),
        previousScore: previous ? Number(previous.score) : null,
        topFactor: top
          ? { factor: top.factor, contribution: Number(top.contribution), plainExplanation: top.plainExplanation }
          : null,
      };
    }

    return {
      membershipId: student.membershipId,
      name: student.name,
      submissionId: sub?.id ?? null,
      status,
      currentStage: sub?.currentStage ?? null,
      stagesCompleted: sub ? completed.get(sub.id) ?? 0 : 0,
      submittedAt: iso(sub?.submittedAt ?? null),
      offloading,
    };
  });

  return {
    assignment: {
      id: meta.id,
      title: meta.title,
      status: meta.status,
      dueAt: iso(meta.dueAt),
      courseId: meta.courseId,
      courseName: meta.courseName,
    },
    counts,
    distribution: LEVELS.map((level) => ({ level, count: distribution[level] })),
    commonFactors: [...factorTally.values()]
      .sort((a, b) => b.students - a.students || b.contribution - a.contribution)
      .slice(0, 4)
      .map((tally) => ({
        factor: tally.factor,
        students: tally.students,
        averageContribution: Math.round((tally.contribution / tally.students) * 10) / 10,
        example: tally.example,
      })),
    students: rows,
  };
}

// One student's process on one assignment, in the order it happened:
// draft, questions to the tutor, evaluation, revision, reflection, then the Index.
export async function getSubmissionProcess(userId: string, assignmentId: string, submissionId: string) {
  if (!(await findTeacherAssignment(userId, assignmentId))) throw notFound();
  const [meta, sub] = await Promise.all([
    findAssignmentMeta(assignmentId),
    findSubmissionForAssignment(assignmentId, submissionId),
  ]);
  if (!meta || !sub) throw notFound();

  const [progress, artifacts, transcript, offloading, history, signals] = await Promise.all([
    listStageProgress(submissionId),
    listArtifacts(submissionId),
    listTutorTranscript(submissionId),
    getSubmissionOffloading(submissionId),
    listCourseOffloading(meta.courseId, [sub.membershipId]),
    listWritingSignals(submissionId),
  ]);

  const stages = STAGES.map((stage) => {
    const state = progress.find((row) => row.stage === stage);
    const versions = artifacts.filter((row) => row.stage === stage);
    const final = versions.find((row) => row.isFinal) ?? versions.at(-1) ?? null;
    return {
      stage,
      status: state?.status ?? "locked",
      startedAt: iso(state?.startedAt ?? null),
      completedAt: iso(state?.completedAt ?? null),
      versions: versions.length,
      content: final?.content ?? null,
      writing: writingView(signals.find((row) => row.stage === stage) ?? null),
    };
  });

  const prompts = transcript.filter((row) => row.author === "student");
  return {
    assignment: { id: meta.id, title: meta.title, courseId: meta.courseId, courseName: meta.courseName },
    student: { name: sub.studentName },
    submission: {
      id: sub.id,
      attemptNumber: sub.attemptNumber,
      status: sub.status,
      currentStage: sub.currentStage,
      startedAt: iso(sub.startedAt),
      submittedAt: iso(sub.submittedAt),
    },
    stages,
    tutor: {
      promptCount: prompts.length,
      intents: {
        direct_answer: prompts.filter((row) => row.intent === "direct_answer").length,
        explanation_hint: prompts.filter((row) => row.intent === "explanation_hint").length,
        reflective_evaluative: prompts.filter((row) => row.intent === "reflective_evaluative").length,
      },
      redirected: transcript.filter((row) => row.wasRedirected).length,
      messages: transcript.map((row) => ({
        id: row.id,
        author: row.author,
        content: row.content,
        mode: row.mode,
        intent: row.intent,
        wasRedirected: row.wasRedirected,
        createdAt: row.createdAt.toISOString(),
      })),
    },
    offloading,
    trend: history.map((row) => ({
      assignmentId: row.assignmentId,
      assignmentTitle: row.assignmentTitle,
      submissionId: row.submissionId,
      level: row.level,
      score: Number(row.score),
      at: iso(row.submittedAt ?? row.computedAt),
      current: row.submissionId === submissionId,
    })),
  };
}

// How the text came about, with the one ratio a teacher reads first: how much of
// the final text arrived by pasting rather than typing.
function writingView(row: Awaited<ReturnType<typeof listWritingSignals>>[number] | null) {
  if (!row) return null;
  const { stage: _stage, ...counts } = row;
  return {
    ...counts,
    pastedShare: row.finalChars > 0 ? Math.min(1, Math.round((row.pastedChars / row.finalChars) * 100) / 100) : 0,
  };
}

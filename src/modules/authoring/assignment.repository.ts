import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
  assignment,
  courseMembership,
  rubric,
  rubricCriterion,
  scenario,
  subject,
  submission,
} from "../../database/schema";
import {
  AuthoringServiceError,
  notFound,
  type Transaction,
} from "./authoring.shared";
import { teacherOf } from "./course.repository";

export type AssignmentStatus = "draft" | "published" | "closed" | "archived";

export type AssignmentSnapshot = {
  id: string;
  courseId: string;
  moduleId: string | null;
  rubricId: string;
  scenarioId: string;
  title: string;
  instructions: string;
  status: AssignmentStatus;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
  publishedAt: Date | null;
  submissionCount: number;
};

export type AssignmentPatch = Partial<{
  title: string;
  instructions: string;
  moduleId: string | null;
  status: AssignmentStatus;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
  publishedAt: Date;
}>;

export type CriterionInput = { label: string; description: string; maxPoints: number };

const ASSIGNMENT_LIMIT_PER_COURSE = 200;

// ---- access -------------------------------------------------------------

export async function findTeacherAssignment(userId: string, assignmentId: string) {
  const [row] = await db
    .select({
      id: assignment.id,
      courseId: assignment.courseId,
      teacherMembershipId: courseMembership.id,
    })
    .from(assignment)
    .innerJoin(courseMembership, teacherOf(assignment.courseId, userId))
    .where(eq(assignment.id, assignmentId))
    .limit(1);
  return row ?? null;
}

// ---- read ---------------------------------------------------------------

export async function getAssignmentEditor(assignmentId: string) {
  const [row] = await db
    .select({
      id: assignment.id,
      courseId: assignment.courseId,
      moduleId: assignment.moduleId,
      rubricId: assignment.rubricId,
      title: assignment.title,
      instructions: assignment.instructions,
      status: assignment.status,
      availableAt: assignment.availableAt,
      dueAt: assignment.dueAt,
      closesAt: assignment.closesAt,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      subjectName: subject.name,
    })
    .from(assignment)
    .innerJoin(scenario, eq(scenario.id, assignment.scenarioId))
    .innerJoin(subject, eq(subject.id, scenario.subjectId))
    .where(eq(assignment.id, assignmentId))
    .limit(1);
  if (!row) throw notFound();

  const [criteria, [counts]] = await Promise.all([
    db
      .select({
        id: rubricCriterion.id,
        label: rubricCriterion.label,
        description: rubricCriterion.description,
        maxPoints: rubricCriterion.maxPoints,
        position: rubricCriterion.position,
      })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.rubricId, row.rubricId))
      .orderBy(asc(rubricCriterion.position)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(submission)
      .where(eq(submission.assignmentId, assignmentId)),
  ]);
  const submissionCount = counts?.total ?? 0;

  const { rubricId: _rubricId, ...assignmentFields } = row;
  return {
    assignment: assignmentFields,
    criteria: criteria.map((criterion) => ({
      ...criterion,
      maxPoints: Number(criterion.maxPoints),
    })),
    submissionCount,
    locked: submissionCount > 0,
    editable: row.status === "draft" && submissionCount === 0,
    readiness: {
      ready: criteria.length > 0,
      problems: criteria.length > 0 ? [] : ["Tambahkan minimal 1 kriteria rubrik."],
    },
  };
}

// ---- guarded writes -----------------------------------------------------

async function loadLockedAssignment(
  tx: Transaction,
  assignmentId: string,
): Promise<AssignmentSnapshot | null> {
  const [row] = await tx
    .select()
    .from(assignment)
    .where(eq(assignment.id, assignmentId))
    .for("update");
  if (!row) return null;
  const [counts] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(submission)
    .where(eq(submission.assignmentId, assignmentId));
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId,
    rubricId: row.rubricId,
    scenarioId: row.scenarioId,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    availableAt: row.availableAt,
    dueAt: row.dueAt,
    closesAt: row.closesAt,
    publishedAt: row.publishedAt,
    submissionCount: counts?.total ?? 0,
  };
}

// Same locking argument as quizzes: `submission.assignment_id` references the
// assignment, so a student starting a submission needs a KEY SHARE lock on the
// row this transaction holds FOR UPDATE.
export async function updateAssignmentGuarded(
  assignmentId: string,
  decide: (
    current: AssignmentSnapshot,
    tx: Transaction,
  ) => Promise<AssignmentPatch> | AssignmentPatch,
) {
  await db.transaction(async (tx) => {
    const current = await loadLockedAssignment(tx, assignmentId);
    if (!current) throw notFound();
    const patch = await decide(current, tx);
    if (Object.keys(patch).length > 0) {
      await tx.update(assignment).set(patch).where(eq(assignment.id, assignmentId));
    }
  });
}

export async function criteriaCountIn(tx: Transaction, rubricId: string) {
  const [row] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(rubricCriterion)
    .where(eq(rubricCriterion.rubricId, rubricId));
  return row?.total ?? 0;
}

export function assertAssignmentContentEditable(current: AssignmentSnapshot) {
  if (current.submissionCount > 0) {
    throw new AuthoringServiceError(
      409,
      "Assignment sudah dikerjakan siswa, jadi instruksi dan rubrik tidak bisa diubah. Arsipkan assignment ini lalu buat salinan baru.",
      "ASSIGNMENT_LOCKED",
    );
  }
  if (current.status !== "draft") {
    throw new AuthoringServiceError(
      409,
      "Kembalikan assignment ke draft sebelum mengubah instruksi atau rubrik.",
      "ASSIGNMENT_NOT_DRAFT",
    );
  }
}

// ---- assignments --------------------------------------------------------

export async function createAssignmentFromScenario(input: {
  courseId: string;
  teacherMembershipId: string;
  scenarioId: string;
  moduleId: string | null;
  title: string | null;
  instructions: string | null;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
}) {
  return db.transaction(async (tx) => {
    const [countRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(assignment)
      .where(eq(assignment.courseId, input.courseId));
    if ((countRow?.total ?? 0) >= ASSIGNMENT_LIMIT_PER_COURSE) {
      throw new AuthoringServiceError(
        409,
        `Jumlah assignment sudah mencapai batas maksimal ${ASSIGNMENT_LIMIT_PER_COURSE}.`,
        "LIMIT_REACHED",
      );
    }

    const [source] = await tx
      .select()
      .from(scenario)
      .where(and(eq(scenario.id, input.scenarioId), eq(scenario.isActive, true)));
    if (!source) {
      throw new AuthoringServiceError(
        400,
        "Scenario tidak ditemukan.",
        "SCENARIO_NOT_FOUND",
      );
    }

    const title = (input.title ?? source.title).slice(0, 160);
    const rubricId = await copyRubric(tx, source.defaultRubricId, `Rubrik: ${title}`);

    const [created] = await tx
      .insert(assignment)
      .values({
        courseId: input.courseId,
        moduleId: input.moduleId,
        scenarioId: source.id,
        rubricId,
        createdByCourseMembershipId: input.teacherMembershipId,
        title,
        instructions: input.instructions ?? source.instructions,
        availableAt: input.availableAt,
        dueAt: input.dueAt,
        closesAt: input.closesAt,
      })
      .returning({ id: assignment.id });
    if (!created) throw new Error("Assignment gagal dibuat.");
    return created;
  });
}

// Each assignment owns a private copy of the rubric so edits (or later grading)
// never leak into the scenario template or into other assignments.
async function copyRubric(tx: Transaction, sourceRubricId: string, name: string) {
  const [source] = await tx.select().from(rubric).where(eq(rubric.id, sourceRubricId));
  if (!source) throw new Error("Rubrik sumber tidak ditemukan.");

  const [copy] = await tx
    .insert(rubric)
    .values({
      name: name.slice(0, 200),
      isTemplate: false,
      sourceRubricId: source.sourceRubricId ?? source.id,
    })
    .returning({ id: rubric.id });
  if (!copy) throw new Error("Rubrik gagal disalin.");

  const criteria = await tx
    .select()
    .from(rubricCriterion)
    .where(eq(rubricCriterion.rubricId, sourceRubricId))
    .orderBy(asc(rubricCriterion.position));
  if (criteria.length > 0) {
    await tx.insert(rubricCriterion).values(
      criteria.map((criterion) => ({
        rubricId: copy.id,
        label: criterion.label,
        description: criterion.description,
        maxPoints: criterion.maxPoints,
        position: criterion.position,
      })),
    );
  }
  return copy.id;
}

export async function duplicateAssignment(assignmentId: string, teacherMembershipId: string) {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(assignment).where(eq(assignment.id, assignmentId));
    if (!source) throw notFound();

    const rubricId = await copyRubric(
      tx,
      source.rubricId,
      `Rubrik: ${source.title} (salinan)`,
    );
    const [copy] = await tx
      .insert(assignment)
      .values({
        courseId: source.courseId,
        moduleId: source.moduleId,
        scenarioId: source.scenarioId,
        rubricId,
        createdByCourseMembershipId: teacherMembershipId,
        title: `${source.title} (salinan)`.slice(0, 160),
        instructions: source.instructions,
        availableAt: source.availableAt,
        dueAt: source.dueAt,
        closesAt: source.closesAt,
        maxAttempts: source.maxAttempts,
      })
      .returning({ id: assignment.id });
    if (!copy) throw new Error("Salinan assignment gagal dibuat.");
    return copy;
  });
}

export async function replaceCriteria(assignmentId: string, criteria: CriterionInput[]) {
  return db.transaction(async (tx) => {
    const current = await loadLockedAssignment(tx, assignmentId);
    if (!current) throw notFound();
    assertAssignmentContentEditable(current);

    await tx.delete(rubricCriterion).where(eq(rubricCriterion.rubricId, current.rubricId));
    if (criteria.length > 0) {
      await tx.insert(rubricCriterion).values(
        criteria.map((criterion, index) => ({
          rubricId: current.rubricId,
          label: criterion.label,
          description: criterion.description,
          maxPoints: criterion.maxPoints.toFixed(2),
          position: index + 1,
        })),
      );
    }
    return { count: criteria.length };
  });
}

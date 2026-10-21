import {
  assertWorkStatusChange,
  AuthoringServiceError,
  notFound,
  validateSchedule,
} from "./authoring.shared";
import {
  assertAssignmentContentEditable,
  createAssignmentFromScenario,
  criteriaCountIn,
  duplicateAssignment,
  findTeacherAssignment,
  getAssignmentEditor,
  replaceCriteria,
  updateAssignmentGuarded,
  type AssignmentStatus,
  type CriterionInput,
} from "./assignment.repository";
import { findTeacherCourse } from "./course.repository";
import { moduleBelongsToCourse } from "./quiz.repository";

export type NewAssignmentInput = {
  scenarioId: string;
  moduleId: string | null;
  title: string | null;
  instructions: string | null;
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
};

async function requireModuleInCourse(moduleId: string | null | undefined, courseId: string) {
  if (moduleId && !(await moduleBelongsToCourse(moduleId, courseId))) {
    throw new AuthoringServiceError(
      400,
      "Modul tidak termasuk dalam course ini.",
      "MODULE_NOT_IN_COURSE",
    );
  }
}

export async function createMyAssignment(
  userId: string,
  courseId: string,
  input: NewAssignmentInput,
) {
  const courseRow = await findTeacherCourse(userId, courseId);
  if (!courseRow) throw notFound();
  await requireModuleInCourse(input.moduleId, courseId);
  validateSchedule(input);
  return createAssignmentFromScenario({
    courseId,
    teacherMembershipId: courseRow.teacherMembershipId,
    ...input,
  });
}

export async function getMyAssignment(userId: string, assignmentId: string) {
  if (!(await findTeacherAssignment(userId, assignmentId))) throw notFound();
  return getAssignmentEditor(assignmentId);
}

export async function updateMyAssignment(
  userId: string,
  assignmentId: string,
  patch: {
    title?: string;
    instructions?: string;
    moduleId?: string | null;
    availableAt?: Date | null;
    dueAt?: Date | null;
    closesAt?: Date | null;
    status?: AssignmentStatus;
  },
) {
  const access = await findTeacherAssignment(userId, assignmentId);
  if (!access) throw notFound();
  if (patch.moduleId !== undefined) await requireModuleInCourse(patch.moduleId, access.courseId);

  await updateAssignmentGuarded(assignmentId, async (current, tx) => {
    validateSchedule({
      availableAt: patch.availableAt !== undefined ? patch.availableAt : current.availableAt,
      dueAt: patch.dueAt !== undefined ? patch.dueAt : current.dueAt,
      closesAt: patch.closesAt !== undefined ? patch.closesAt : current.closesAt,
    });

    // Title, module and schedule stay editable; the text students were graded
    // against does not.
    if (patch.instructions !== undefined && patch.instructions !== current.instructions) {
      assertAssignmentContentEditable(current);
    }

    let publishedAt: Date | undefined;
    if (patch.status && patch.status !== current.status) {
      assertWorkStatusChange(
        current.status,
        patch.status,
        current.submissionCount > 0,
        "assignment",
      );
      if (patch.status === "published") {
        if ((await criteriaCountIn(tx, current.rubricId)) === 0) {
          throw new AuthoringServiceError(
            409,
            "Tambahkan minimal 1 kriteria rubrik sebelum menerbitkan assignment.",
            "ASSIGNMENT_NOT_READY",
          );
        }
        if (!current.publishedAt) publishedAt = new Date();
      }
    }

    return { ...patch, ...(publishedAt ? { publishedAt } : {}) };
  });
  return { id: assignmentId };
}

export async function copyMyAssignment(userId: string, assignmentId: string) {
  const access = await findTeacherAssignment(userId, assignmentId);
  if (!access) throw notFound();
  return duplicateAssignment(assignmentId, access.teacherMembershipId);
}

export async function setMyCriteria(
  userId: string,
  assignmentId: string,
  criteria: CriterionInput[],
) {
  if (!(await findTeacherAssignment(userId, assignmentId))) throw notFound();
  return replaceCriteria(assignmentId, criteria);
}

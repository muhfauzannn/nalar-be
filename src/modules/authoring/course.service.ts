import { generateJoinCode } from "../../lib/join-code";
import {
  AuthoringServiceError,
  isUniqueViolation,
  notFound,
} from "./authoring.shared";
import {
  countTeachingCourses,
  createCourseWithTeacher,
  createLesson,
  createModule,
  createResource,
  deleteResource,
  findSubject,
  findTeacherCourse,
  findTeacherLesson,
  findTeacherModule,
  findTeacherResource,
  getCourseEditor,
  getLessonEditor,
  listActiveScenarios,
  listSubjects,
  listTeacherCourses,
  reorderLessons,
  reorderModules,
  reorderResources,
  setCourseJoinCode,
  updateCourse,
  updateLesson,
  updateModule,
  updateResource,
  type ResourceInput,
} from "./course.repository";

export type CourseStatus = "draft" | "published" | "archived";
export type PublicationStatus = "draft" | "published" | "archived";

const COURSE_LIMIT_PER_USER = 50;
const JOIN_CODE_ATTEMPTS = 5;

async function requireCourse(userId: string, courseId: string) {
  const row = await findTeacherCourse(userId, courseId);
  if (!row) throw notFound();
  return row;
}

async function requireSubject(subjectId: string) {
  if (!(await findSubject(subjectId))) {
    throw new AuthoringServiceError(400, "Mata pelajaran tidak ditemukan.", "SUBJECT_NOT_FOUND");
  }
}

// ---- reference data -----------------------------------------------------

export async function listAuthoringSubjects() {
  return { subjects: await listSubjects() };
}

export async function listAuthoringScenarios() {
  return { scenarios: await listActiveScenarios() };
}

// ---- courses ------------------------------------------------------------

export async function createCourse(
  userId: string,
  input: { name: string; description: string | null; subjectId: string },
) {
  await requireSubject(input.subjectId);
  if ((await countTeachingCourses(userId)) >= COURSE_LIMIT_PER_USER) {
    throw new AuthoringServiceError(
      409,
      `Kamu sudah mencapai batas ${COURSE_LIMIT_PER_USER} course.`,
      "LIMIT_REACHED",
    );
  }

  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
    try {
      const created = await createCourseWithTeacher({
        userId,
        ...input,
        joinCode: generateJoinCode(),
      });
      return { id: created.id };
    } catch (error) {
      if (!isUniqueViolation(error, "course_join_code_unique")) throw error;
    }
  }
  throw new Error("Kode kelas unik gagal dibuat.");
}

export async function listMyCourses(userId: string) {
  return { courses: await listTeacherCourses(userId) };
}

export async function getMyCourse(userId: string, courseId: string) {
  const courseRow = await requireCourse(userId, courseId);
  const editor = await getCourseEditor(courseId);
  return {
    course: {
      id: courseRow.id,
      name: courseRow.name,
      description: courseRow.description,
      status: courseRow.status,
      subjectId: courseRow.subjectId,
      subjectName: courseRow.subjectName,
      joinCode: courseRow.joinCode,
    },
    ...editor,
  };
}

const COURSE_TRANSITIONS: Record<CourseStatus, readonly CourseStatus[]> = {
  draft: ["published", "archived"],
  published: ["archived", "draft"],
  archived: ["published", "draft"],
};

export async function updateMyCourse(
  userId: string,
  courseId: string,
  patch: {
    name?: string;
    description?: string | null;
    subjectId?: string;
    status?: CourseStatus;
  },
) {
  const current = await requireCourse(userId, courseId);
  if (patch.subjectId) await requireSubject(patch.subjectId);

  if (patch.status && patch.status !== current.status) {
    if (!COURSE_TRANSITIONS[current.status].includes(patch.status)) {
      throw new AuthoringServiceError(
        409,
        "Perubahan status course tidak diizinkan.",
        "INVALID_TRANSITION",
      );
    }
    if (patch.status === "draft") {
      const { studentCount } = await getCourseEditor(courseId);
      if (studentCount > 0) {
        throw new AuthoringServiceError(
          409,
          "Course yang sudah punya siswa tidak bisa dikembalikan ke draft. Arsipkan saja.",
          "INVALID_TRANSITION",
        );
      }
    }
  }

  await updateCourse(courseId, patch);
  return { id: courseId };
}

export async function regenerateJoinCode(userId: string, courseId: string) {
  await requireCourse(userId, courseId);
  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      await setCourseJoinCode(courseId, joinCode);
      return { joinCode };
    } catch (error) {
      if (!isUniqueViolation(error, "course_join_code_unique")) throw error;
    }
  }
  throw new Error("Kode kelas unik gagal dibuat.");
}

export async function disableJoinCode(userId: string, courseId: string) {
  await requireCourse(userId, courseId);
  await setCourseJoinCode(courseId, null);
  return { joinCode: null };
}

// ---- modules ------------------------------------------------------------

export async function addModule(
  userId: string,
  courseId: string,
  input: { title: string; description: string | null; status: PublicationStatus },
) {
  await requireCourse(userId, courseId);
  return createModule(courseId, input);
}

export async function editModule(
  userId: string,
  moduleId: string,
  patch: { title?: string; description?: string | null; status?: PublicationStatus },
) {
  const current = await findTeacherModule(userId, moduleId);
  if (!current) throw notFound();
  await updateModule(moduleId, {
    ...patch,
    ...(patch.status === "published" && !current.publishedAt
      ? { publishedAt: new Date() }
      : {}),
  });
  return { id: moduleId };
}

export async function orderModules(userId: string, courseId: string, ids: string[]) {
  await requireCourse(userId, courseId);
  await reorderModules(courseId, ids);
  return { ok: true };
}

// ---- lessons ------------------------------------------------------------

export async function addLesson(
  userId: string,
  moduleId: string,
  input: { title: string; content: string | null; status: PublicationStatus },
) {
  if (!(await findTeacherModule(userId, moduleId))) throw notFound();
  return createLesson(moduleId, input);
}

export async function getMyLesson(userId: string, lessonId: string) {
  if (!(await findTeacherLesson(userId, lessonId))) throw notFound();
  const editor = await getLessonEditor(lessonId);
  if (!editor) throw notFound();
  return editor;
}

export async function editLesson(
  userId: string,
  lessonId: string,
  patch: { title?: string; content?: string | null; status?: PublicationStatus },
) {
  const current = await findTeacherLesson(userId, lessonId);
  if (!current) throw notFound();
  await updateLesson(lessonId, {
    ...patch,
    ...(patch.status === "published" && !current.publishedAt
      ? { publishedAt: new Date() }
      : {}),
  });
  return { id: lessonId };
}

export async function orderLessons(userId: string, moduleId: string, ids: string[]) {
  if (!(await findTeacherModule(userId, moduleId))) throw notFound();
  await reorderLessons(moduleId, ids);
  return { ok: true };
}

// ---- resources ----------------------------------------------------------

export async function addResource(userId: string, lessonId: string, input: ResourceInput) {
  if (!(await findTeacherLesson(userId, lessonId))) throw notFound();
  return createResource(lessonId, input);
}

export async function editResource(userId: string, resourceId: string, input: ResourceInput) {
  if (!(await findTeacherResource(userId, resourceId))) throw notFound();
  await updateResource(resourceId, input);
  return { id: resourceId };
}

export async function removeResource(userId: string, resourceId: string) {
  if (!(await findTeacherResource(userId, resourceId))) throw notFound();
  await deleteResource(resourceId);
  return { deleted: true };
}

export async function orderResources(userId: string, lessonId: string, ids: string[]) {
  if (!(await findTeacherLesson(userId, lessonId))) throw notFound();
  await reorderResources(lessonId, ids);
  return { ok: true };
}

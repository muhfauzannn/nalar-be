import { AuthoringServiceError, notFound } from "../authoring/authoring.shared";
import { findTeacherLesson } from "../authoring/course.repository";
import { StudentServiceError } from "../student/student.service";
import { findLab, LAB_CATALOG, LAB_CHALLENGE_POINTS } from "./lab-catalog";
import {
  countLabCompletions,
  deleteLessonLab,
  findLessonLab,
  findStudentLab,
  insertChallengeCompletion,
  insertLessonLab,
  listLessonLabs,
} from "./labs.repository";

export function labCatalog() {
  return LAB_CATALOG.map((lab) => ({ key: lab.key, title: lab.title, subject: lab.subject }));
}

export async function attachLab(userId: string, lessonId: string, labKey: string) {
  if (!(await findTeacherLesson(userId, lessonId))) throw notFound();
  if (!findLab(labKey)) {
    throw new AuthoringServiceError(400, "Lab tidak ada di katalog.", "LAB_NOT_FOUND");
  }
  await insertLessonLab(lessonId, labKey);
  return { labs: await listLessonLabs(lessonId) };
}

// A lab students already solved challenges in stays, so their points stay too.
export async function detachLab(userId: string, labId: string) {
  const lab = await findLessonLab(labId);
  if (!lab || !(await findTeacherLesson(userId, lab.lessonId))) throw notFound();
  if ((await countLabCompletions(labId)) > 0) {
    throw new AuthoringServiceError(409, "Lab ini sudah dikerjakan siswa, jadi tidak bisa dilepas.", "LAB_IN_USE");
  }
  await deleteLessonLab(labId);
  return { deleted: true };
}

export async function completeLabChallenge(userId: string, labId: string, challenge: string) {
  const lab = await findStudentLab(labId, userId);
  if (!lab) throw new StudentServiceError(404, "Lab tidak ditemukan.");
  const entry = findLab(lab.labKey);
  if (!entry || !(entry.challenges as readonly string[]).includes(challenge)) {
    throw new StudentServiceError(400, "Tantangan lab tidak dikenal.");
  }
  if (lab.membershipStatus !== "active") {
    throw new StudentServiceError(409, "Course arsip hanya dapat dilihat.");
  }
  const created = await insertChallengeCompletion(labId, lab.membershipId, challenge);
  return { points: created ? LAB_CHALLENGE_POINTS : 0 };
}

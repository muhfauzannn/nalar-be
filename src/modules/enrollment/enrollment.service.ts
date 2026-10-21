import { normalizeJoinCode } from "../../lib/join-code";
import { createRateLimiter } from "../../lib/rate-limit";
import { isUniqueViolation } from "../authoring/authoring.shared";
import {
  activateMembership,
  createStudentMembership,
  findCourseByJoinCode,
  listCourseRoles,
} from "./enrollment.repository";

export type EnrollmentErrorCode =
  | "JOIN_CODE_INVALID"
  | "JOIN_RATE_LIMITED"
  | "JOIN_IS_TEACHER"
  | "JOIN_REMOVED";

export class EnrollmentServiceError extends Error {
  constructor(
    public readonly status: 403 | 404 | 409 | 429,
    message: string,
    public readonly code: EnrollmentErrorCode,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "EnrollmentServiceError";
  }
}

// Only FAILED attempts are counted and a success never clears them: otherwise
// whoever knows one valid code could alternate it with guesses forever.
export const joinRateLimiter = createRateLimiter({
  maxEvents: 10,
  windowMs: 10 * 60 * 1_000,
});

const INVALID = "Kode kelas tidak valid atau course belum dibuka.";

export async function joinCourseWithCode(userId: string, rawCode: string) {
  const limit = joinRateLimiter.check(userId);
  if (!limit.allowed) {
    throw new EnrollmentServiceError(
      429,
      "Terlalu banyak percobaan kode kelas. Coba lagi beberapa menit lagi.",
      "JOIN_RATE_LIMITED",
      limit.retryAfterSeconds,
    );
  }

  const fail = () => {
    joinRateLimiter.record(userId);
    return new EnrollmentServiceError(404, INVALID, "JOIN_CODE_INVALID");
  };

  const code = normalizeJoinCode(rawCode);
  if (!code) throw fail();

  // Unknown code, disabled code and unpublished course all answer the same, so
  // the response does not reveal which courses exist.
  const courseRow = await findCourseByJoinCode(code);
  if (!courseRow || courseRow.status !== "published") throw fail();

  const roles = await listCourseRoles(courseRow.id, userId);
  if (roles.some((entry) => entry.role === "teacher")) {
    throw new EnrollmentServiceError(
      409,
      "Kamu adalah pengajar course ini.",
      "JOIN_IS_TEACHER",
    );
  }

  const student = roles.find((entry) => entry.role === "student");
  const summary = { id: courseRow.id, name: courseRow.name };
  if (student) {
    if (student.status === "removed") {
      throw new EnrollmentServiceError(
        403,
        "Kamu tidak dapat bergabung kembali ke course ini.",
        "JOIN_REMOVED",
      );
    }
    if (student.status === "invited") await activateMembership(student.id);
    return { course: summary, alreadyJoined: student.status !== "invited" };
  }

  try {
    await createStudentMembership(courseRow.id, userId);
  } catch (error) {
    // Two taps on "Gabung" at once: the second insert loses the race.
    if (isUniqueViolation(error, "course_membership_course_member_role_unique")) {
      return { course: summary, alreadyJoined: true };
    }
    throw error;
  }
  return { course: summary, alreadyJoined: false };
}

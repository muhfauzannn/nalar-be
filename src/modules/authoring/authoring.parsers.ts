import { normalizeShortAnswer } from "../../lib/quiz-readiness";
import type { CriterionInput } from "./assignment.repository";
import type { NewAssignmentInput } from "./assignment.service";
import {
  asObject,
  AuthoringRequestError,
  boundedNumber,
  has,
  httpUrl,
  oneOf,
  optionalDate,
  optionalText,
  text,
  uuid,
  uuidList,
} from "./authoring.shared";
import type { ResourceInput } from "./course.repository";
import type { PublicationStatus, CourseStatus } from "./course.service";
import type { QuestionInput, QuizStatus } from "./quiz.repository";
import type { QuizInput } from "./quiz.service";

const PUBLICATION = ["draft", "published", "archived"] as const;
const WORK = ["draft", "published", "closed", "archived"] as const;

function nonEmpty<T extends object>(patch: T): T {
  if (Object.keys(patch).length === 0) {
    throw new AuthoringRequestError("Tidak ada perubahan yang dikirim.");
  }
  return patch;
}

function nullableUuid(value: unknown, label: string) {
  return value === null ? null : uuid(value, label);
}

// ---- course -------------------------------------------------------------

export function parseNewCourse(body: Record<string, unknown>) {
  return {
    name: text(body.name, "Nama course", { max: 120 }),
    description: optionalText(body.description, "Deskripsi", 2000),
    subjectId: uuid(body.subjectId, "Mata pelajaran"),
  };
}

export function parseCoursePatch(body: Record<string, unknown>) {
  const patch: {
    name?: string;
    description?: string | null;
    subjectId?: string;
    status?: CourseStatus;
  } = {};
  if (has(body, "name")) patch.name = text(body.name, "Nama course", { max: 120 });
  if (has(body, "description")) patch.description = optionalText(body.description, "Deskripsi", 2000);
  if (has(body, "subjectId")) patch.subjectId = uuid(body.subjectId, "Mata pelajaran");
  if (has(body, "status")) patch.status = oneOf(body.status, PUBLICATION, "Status course");
  return nonEmpty(patch);
}

// ---- modules / lessons / resources --------------------------------------

export function parseNewModule(body: Record<string, unknown>) {
  return {
    title: text(body.title, "Judul modul", { max: 120 }),
    description: optionalText(body.description, "Deskripsi", 1000),
    status: has(body, "status")
      ? oneOf<PublicationStatus>(body.status, PUBLICATION, "Status modul")
      : ("draft" as const),
  };
}

export function parseModulePatch(body: Record<string, unknown>) {
  const patch: { title?: string; description?: string | null; status?: PublicationStatus } = {};
  if (has(body, "title")) patch.title = text(body.title, "Judul modul", { max: 120 });
  if (has(body, "description")) patch.description = optionalText(body.description, "Deskripsi", 1000);
  if (has(body, "status")) patch.status = oneOf(body.status, PUBLICATION, "Status modul");
  return nonEmpty(patch);
}

export function parseNewLesson(body: Record<string, unknown>) {
  return {
    title: text(body.title, "Judul lesson", { max: 160 }),
    content: optionalText(body.content, "Isi lesson", 50_000),
    status: has(body, "status")
      ? oneOf<PublicationStatus>(body.status, PUBLICATION, "Status lesson")
      : ("draft" as const),
  };
}

export function parseLessonPatch(body: Record<string, unknown>) {
  const patch: { title?: string; content?: string | null; status?: PublicationStatus } = {};
  if (has(body, "title")) patch.title = text(body.title, "Judul lesson", { max: 160 });
  if (has(body, "content")) patch.content = optionalText(body.content, "Isi lesson", 50_000);
  if (has(body, "status")) patch.status = oneOf(body.status, PUBLICATION, "Status lesson");
  return nonEmpty(patch);
}

export function parseResource(body: Record<string, unknown>): ResourceInput {
  const type = oneOf(body.type, ["text", "link", "file"] as const, "Tipe resource");
  const title = text(body.title, "Judul resource", { max: 160 });
  if (type === "text") {
    return { type, title, content: text(body.content, "Isi resource", { max: 10_000 }), url: null };
  }
  return {
    type,
    title,
    content: optionalText(body.content, "Deskripsi resource", 1000),
    url: httpUrl(body.url, "URL resource"),
  };
}

export function parseOrder(body: Record<string, unknown>) {
  return uuidList(body.ids, "Daftar urutan", 500);
}

// ---- quizzes ------------------------------------------------------------

function parseTimeLimit(value: unknown) {
  return value === null || value === "" || value === undefined
    ? null
    : boundedNumber(value, "Batas waktu (menit)", { min: 1, max: 600, integer: true });
}

export function parseNewQuiz(body: Record<string, unknown>): QuizInput {
  return {
    title: text(body.title, "Judul kuis", { max: 160 }),
    instructions: optionalText(body.instructions, "Instruksi", 5000),
    moduleId: has(body, "moduleId") ? nullableUuid(body.moduleId, "Modul") : null,
    availableAt: optionalDate(body.availableAt, "Waktu mulai"),
    dueAt: optionalDate(body.dueAt, "Batas pengumpulan"),
    closesAt: optionalDate(body.closesAt, "Waktu penutupan"),
    timeLimitMinutes: parseTimeLimit(body.timeLimitMinutes),
  };
}

export function parseQuizPatch(body: Record<string, unknown>) {
  const patch: Partial<QuizInput> & { status?: QuizStatus } = {};
  if (has(body, "title")) patch.title = text(body.title, "Judul kuis", { max: 160 });
  if (has(body, "instructions")) patch.instructions = optionalText(body.instructions, "Instruksi", 5000);
  if (has(body, "moduleId")) patch.moduleId = nullableUuid(body.moduleId, "Modul");
  if (has(body, "availableAt")) patch.availableAt = optionalDate(body.availableAt, "Waktu mulai");
  if (has(body, "dueAt")) patch.dueAt = optionalDate(body.dueAt, "Batas pengumpulan");
  if (has(body, "closesAt")) patch.closesAt = optionalDate(body.closesAt, "Waktu penutupan");
  if (has(body, "timeLimitMinutes")) patch.timeLimitMinutes = parseTimeLimit(body.timeLimitMinutes);
  if (has(body, "status")) patch.status = oneOf(body.status, WORK, "Status kuis");
  return nonEmpty(patch);
}

export function parseQuestion(body: Record<string, unknown>): QuestionInput {
  const type = oneOf(body.type, ["multiple_choice", "short_answer"] as const, "Tipe soal");
  const prompt = text(body.prompt, "Soal", { max: 3000 });
  const explanation = optionalText(body.explanation, "Pembahasan", 3000);
  const points = has(body, "points")
    ? Math.round(
        boundedNumber(body.points, "Poin", { min: 0, max: 100, exclusiveMin: true }) * 100,
      ) / 100
    : 1;
  if (points <= 0) throw new AuthoringRequestError("Poin harus lebih dari 0.");

  if (type === "multiple_choice") {
    if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 8) {
      throw new AuthoringRequestError("Pilihan ganda harus punya 2–8 opsi.");
    }
    const options = body.options.map((item) => {
      const option = asObject(item, "Opsi");
      return {
        label: text(option.label, "Teks opsi", { max: 300 }),
        isCorrect: option.isCorrect === true,
      };
    });
    const labels = options.map((option) => option.label.toLocaleLowerCase("id-ID"));
    if (new Set(labels).size !== labels.length) {
      throw new AuthoringRequestError("Teks opsi tidak boleh sama.");
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      throw new AuthoringRequestError("Pilih tepat satu jawaban yang benar.");
    }
    return { type, prompt, explanation, points, options };
  }

  if (!Array.isArray(body.acceptedAnswers) || body.acceptedAnswers.length === 0) {
    throw new AuthoringRequestError("Isian singkat butuh minimal 1 jawaban yang diterima.");
  }
  if (body.acceptedAnswers.length > 20) {
    throw new AuthoringRequestError("Jawaban yang diterima maksimal 20.");
  }
  const seen = new Set<string>();
  const acceptedAnswers: string[] = [];
  for (const item of body.acceptedAnswers) {
    const answer = text(item, "Jawaban yang diterima", { max: 200 });
    const key = normalizeShortAnswer(answer);
    if (seen.has(key)) continue;
    seen.add(key);
    acceptedAnswers.push(answer);
  }
  return { type, prompt, explanation, points, acceptedAnswers };
}

// ---- assignments --------------------------------------------------------

export function parseNewAssignment(body: Record<string, unknown>): NewAssignmentInput {
  return {
    scenarioId: uuid(body.scenarioId, "Scenario"),
    moduleId: has(body, "moduleId") ? nullableUuid(body.moduleId, "Modul") : null,
    title: optionalText(body.title, "Judul assignment", 160),
    instructions: optionalText(body.instructions, "Instruksi", 10_000),
    availableAt: optionalDate(body.availableAt, "Waktu mulai"),
    dueAt: optionalDate(body.dueAt, "Batas pengumpulan"),
    closesAt: optionalDate(body.closesAt, "Waktu penutupan"),
  };
}

export function parseAssignmentPatch(body: Record<string, unknown>) {
  const patch: {
    title?: string;
    instructions?: string;
    moduleId?: string | null;
    availableAt?: Date | null;
    dueAt?: Date | null;
    closesAt?: Date | null;
    status?: QuizStatus;
  } = {};
  if (has(body, "title")) patch.title = text(body.title, "Judul assignment", { max: 160 });
  if (has(body, "instructions")) {
    patch.instructions = text(body.instructions, "Instruksi", { max: 10_000 });
  }
  if (has(body, "moduleId")) patch.moduleId = nullableUuid(body.moduleId, "Modul");
  if (has(body, "availableAt")) patch.availableAt = optionalDate(body.availableAt, "Waktu mulai");
  if (has(body, "dueAt")) patch.dueAt = optionalDate(body.dueAt, "Batas pengumpulan");
  if (has(body, "closesAt")) patch.closesAt = optionalDate(body.closesAt, "Waktu penutupan");
  if (has(body, "status")) patch.status = oneOf(body.status, WORK, "Status assignment");
  return nonEmpty(patch);
}

export function parseCriteria(body: Record<string, unknown>): CriterionInput[] {
  if (!Array.isArray(body.criteria) || body.criteria.length > 20) {
    throw new AuthoringRequestError("Kriteria rubrik harus berupa daftar (maksimal 20).");
  }
  return body.criteria.map((item) => {
    const criterion = asObject(item, "Kriteria");
    return {
      label: text(criterion.label, "Nama kriteria", { max: 120 }),
      description: text(criterion.description, "Deskripsi kriteria", { max: 1000 }),
      maxPoints:
        Math.round(
          boundedNumber(criterion.maxPoints, "Poin maksimal", {
            min: 0,
            max: 100,
            exclusiveMin: true,
          }) * 100,
        ) / 100,
    };
  });
}

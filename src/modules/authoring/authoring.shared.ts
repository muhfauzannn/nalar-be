import { sql } from "drizzle-orm";

import { db } from "../../database/client";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuthoringErrorCode =
  | "NOT_FOUND"
  | "LIMIT_REACHED"
  | "INVALID_TRANSITION"
  | "INVALID_SCHEDULE"
  | "ORDER_MISMATCH"
  | "QUIZ_LOCKED"
  | "QUIZ_NOT_DRAFT"
  | "QUIZ_NOT_READY"
  | "ASSIGNMENT_LOCKED"
  | "ASSIGNMENT_NOT_DRAFT"
  | "ASSIGNMENT_NOT_READY"
  | "SCENARIO_NOT_FOUND"
  | "SUBJECT_NOT_FOUND"
  | "MODULE_NOT_IN_COURSE";

export class AuthoringServiceError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
    public readonly code: AuthoringErrorCode,
  ) {
    super(message);
    this.name = "AuthoringServiceError";
  }
}

// Same response for "does not exist" and "belongs to somebody else": a caller
// must not be able to probe which ids exist.
export function notFound() {
  return new AuthoringServiceError(404, "Data tidak ditemukan.", "NOT_FOUND");
}

export class AuthoringRequestError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "AuthoringRequestError";
  }
}

// ---- input parsing ------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AuthoringRequestError("Body JSON tidak valid.");
  }
  return asObject(value, "Body");
}

export function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoringRequestError(`${label} harus berupa object JSON.`);
  }
  return value as Record<string, unknown>;
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new AuthoringRequestError(`${label} tidak valid.`);
  }
  return value;
}

export function text(
  value: unknown,
  label: string,
  limits: { min?: number; max: number },
): string {
  if (typeof value !== "string") {
    throw new AuthoringRequestError(`${label} wajib berupa teks.`);
  }
  const trimmed = value.trim();
  const min = limits.min ?? 1;
  if (trimmed.length < min || trimmed.length > limits.max) {
    throw new AuthoringRequestError(
      min <= 1
        ? `${label} wajib diisi dan maksimal ${limits.max} karakter.`
        : `${label} harus ${min}–${limits.max} karakter.`,
    );
  }
  return trimmed;
}

// "" and null both mean "no value".
export function optionalText(
  value: unknown,
  label: string,
  max: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AuthoringRequestError(`${label} harus berupa teks.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new AuthoringRequestError(`${label} maksimal ${max} karakter.`);
  }
  return trimmed;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AuthoringRequestError(`${label} tidak valid.`);
  }
  return value as T;
}

export function boundedNumber(
  value: unknown,
  label: string,
  limits: { min: number; max: number; integer?: boolean; exclusiveMin?: boolean },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AuthoringRequestError(`${label} harus berupa angka.`);
  }
  const belowMin = limits.exclusiveMin ? value <= limits.min : value < limits.min;
  if (belowMin || value > limits.max || (limits.integer && !Number.isInteger(value))) {
    throw new AuthoringRequestError(
      `${label} harus ${limits.integer ? "bilangan bulat " : ""}antara ${limits.min} dan ${limits.max}.`,
    );
  }
  return value;
}

export function optionalDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AuthoringRequestError(`${label} harus berupa tanggal ISO 8601.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuthoringRequestError(`${label} bukan tanggal yang valid.`);
  }
  return parsed;
}

// Only http(s). A `javascript:` or `data:` URL stored in a resource would run
// in the student's browser when the link is clicked.
export function httpUrl(value: unknown, label: string): string {
  const raw = text(value, label, { max: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AuthoringRequestError(`${label} bukan URL yang valid.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AuthoringRequestError(`${label} harus diawali http:// atau https://.`);
  }
  return parsed.toString();
}

export function has(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

export function uuidList(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new AuthoringRequestError(`${label} wajib berupa daftar ID (maksimal ${max}).`);
  }
  const ids = value.map((item) => uuid(item, label));
  if (new Set(ids).size !== ids.length) {
    throw new AuthoringRequestError(`${label} tidak boleh berisi ID ganda.`);
  }
  return ids;
}

export function validateSchedule(input: {
  availableAt: Date | null;
  dueAt: Date | null;
  closesAt: Date | null;
}) {
  const { availableAt, dueAt, closesAt } = input;
  if (availableAt && dueAt && availableAt > dueAt) {
    throw new AuthoringServiceError(
      400,
      "Tanggal tersedia harus sebelum atau sama dengan batas pengumpulan.",
      "INVALID_SCHEDULE",
    );
  }
  if (dueAt && closesAt && dueAt > closesAt) {
    throw new AuthoringServiceError(
      400,
      "Batas pengumpulan harus sebelum atau sama dengan waktu penutupan.",
      "INVALID_SCHEDULE",
    );
  }
}

// ---- sibling ordering ---------------------------------------------------
//
// Every ordered child table has UNIQUE (parent, position) with position > 0, and
// Postgres checks a non-deferrable unique constraint row by row, so swapping two
// items in one UPDATE can fail half-way. Reordering therefore parks the whole
// sibling group above the live range first, then writes the final numbers.

const ORDERED_TABLES = {
  learning_module: "course_id",
  lesson: "module_id",
  learning_resource: "lesson_id",
  quiz_question: "quiz_id",
  quiz_option: "question_id",
  rubric_criterion: "rubric_id",
} as const;

export type OrderedTable = keyof typeof ORDERED_TABLES;

// quiz_option / quiz_question / rubric_criterion positions are smallint.
const PARKING_OFFSET = 20_000;
const COMPACT_ABOVE = 5_000;

function orderedParts(table: OrderedTable) {
  return {
    tableName: sql.identifier(table),
    parentColumn: sql.identifier(ORDERED_TABLES[table]),
  };
}

export async function listSiblingIds(
  tx: Transaction,
  table: OrderedTable,
  parentId: string,
): Promise<string[]> {
  const { tableName, parentColumn } = orderedParts(table);
  const rows = await tx.execute<{ id: string }>(
    sql`select id from ${tableName} where ${parentColumn} = ${parentId} order by position`,
  );
  return rows.map((row) => row.id);
}

// Caller must already hold a row lock on the parent so two concurrent appends
// cannot pick the same number.
export async function nextPosition(
  tx: Transaction,
  table: OrderedTable,
  parentId: string,
): Promise<number> {
  const { tableName, parentColumn } = orderedParts(table);
  const [stats] = await tx.execute<{ max: number; count: number }>(
    sql`select coalesce(max(position), 0)::int as max, count(*)::int as count
        from ${tableName} where ${parentColumn} = ${parentId}`,
  );
  const max = stats?.max ?? 0;
  const count = stats?.count ?? 0;
  if (max < COMPACT_ABOVE) return max + 1;

  await reorderSiblings(tx, table, parentId, await listSiblingIds(tx, table, parentId));
  return count + 1;
}

export async function reorderSiblings(
  tx: Transaction,
  table: OrderedTable,
  parentId: string,
  orderedIds: string[],
) {
  const { tableName, parentColumn } = orderedParts(table);
  const current = await listSiblingIds(tx, table, parentId);
  const sameSet =
    current.length === orderedIds.length &&
    current.every((id) => orderedIds.includes(id));
  if (!sameSet) {
    throw new AuthoringServiceError(
      409,
      "Daftar urutan tidak sesuai dengan isi saat ini. Muat ulang halaman lalu coba lagi.",
      "ORDER_MISMATCH",
    );
  }

  await tx.execute(
    sql`update ${tableName} set position = position + ${PARKING_OFFSET}
        where ${parentColumn} = ${parentId}`,
  );
  const values = sql.join(
    orderedIds.map((id, index) => sql`(${id}::uuid, ${index + 1}::int)`),
    sql`, `,
  );
  await tx.execute(
    sql`update ${tableName} as t set position = v.position
        from (values ${values}) as v(id, position) where t.id = v.id`,
  );
}

export async function assertBelowLimit(
  tx: Transaction,
  table: OrderedTable,
  parentId: string,
  limit: number,
  label: string,
) {
  const { tableName, parentColumn } = orderedParts(table);
  const [row] = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from ${tableName} where ${parentColumn} = ${parentId}`,
  );
  if ((row?.count ?? 0) >= limit) {
    throw new AuthoringServiceError(
      409,
      `${label} sudah mencapai batas maksimal ${limit}.`,
      "LIMIT_REACHED",
    );
  }
}

// drizzle wraps driver errors; the Postgres error is on `.cause`.
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current: unknown = error; current && typeof current === "object"; ) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === "23505") {
      return !constraint || candidate.constraint_name === constraint;
    }
    current = candidate.cause;
  }
  return false;
}

// ---- status machine for quizzes and assignments -------------------------

export type WorkStatus = "draft" | "published" | "closed" | "archived";

const WORK_TRANSITIONS: Record<WorkStatus, readonly WorkStatus[]> = {
  draft: ["published", "archived"],
  published: ["closed", "archived", "draft"],
  closed: ["published", "archived", "draft"],
  archived: ["draft", "closed", "published"],
};

// Once a student has started, the item can no longer go back to draft: draft is
// the only state whose content is editable, and student results were produced
// against the content as it was.
export function assertWorkStatusChange(
  from: WorkStatus,
  to: WorkStatus,
  hasStudentWork: boolean,
  noun: string,
) {
  if (from === to) return;
  if (!WORK_TRANSITIONS[from].includes(to)) {
    throw new AuthoringServiceError(
      409,
      `Status ${noun} tidak dapat diubah dari ${from} ke ${to}.`,
      "INVALID_TRANSITION",
    );
  }
  if (to === "draft" && hasStudentWork) {
    throw new AuthoringServiceError(
      409,
      `${noun[0]?.toUpperCase()}${noun.slice(1)} sudah dikerjakan siswa dan tidak bisa dikembalikan ke draft. Tutup atau arsipkan saja.`,
      "INVALID_TRANSITION",
    );
  }
}

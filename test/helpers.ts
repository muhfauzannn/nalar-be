import app from "../src/app";
import { db } from "../src/database/client";
import {
  rubric,
  rubricCriterion,
  scenario,
  subject,
} from "../src/database/schema";

export const ORIGIN = "http://localhost:5173";

export type Client = { id: string; email: string; cookie: string };
export type Reply = { status: number; body: any; headers: Headers };

export async function newUser(label = "user"): Promise<Client> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name: label, email, password: "password1234" }),
  });
  if (!res.ok) throw new Error(`sign-up gagal: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { user: { id: string } };
  const cookie = res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  return { id: json.user.id, email, cookie };
}

export async function api(
  client: Client | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Reply> {
  const res = await app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(client ? { cookie: client.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

export async function firstSubjectId(client: Client) {
  const reply = await api(client, "GET", "/api/manage/subjects");
  return reply.body.subjects[0].id as string;
}

export async function makeCourse(owner: Client, overrides: Record<string, unknown> = {}) {
  const subjectId = await firstSubjectId(owner);
  const created = await api(owner, "POST", "/api/manage/courses", {
    name: "Course uji",
    subjectId,
    ...overrides,
  });
  if (created.status !== 201) throw new Error(`makeCourse: ${JSON.stringify(created.body)}`);
  const id = created.body.id as string;
  const editor = await api(owner, "GET", `/api/manage/courses/${id}`);
  return { id, joinCode: editor.body.course.joinCode as string };
}

export async function publishCourse(owner: Client, courseId: string) {
  const reply = await api(owner, "PATCH", `/api/manage/courses/${courseId}`, {
    status: "published",
  });
  if (reply.status !== 200) throw new Error(`publishCourse: ${JSON.stringify(reply.body)}`);
}

export async function joinCourse(student: Client, code: string) {
  return api(student, "POST", "/api/courses/join", { code });
}

export const multipleChoice = (overrides: Record<string, unknown> = {}) => ({
  type: "multiple_choice",
  prompt: "Berapa 2 + 2?",
  explanation: "Penjumlahan dasar.",
  points: 1,
  options: [
    { label: "3", isCorrect: false },
    { label: "4", isCorrect: true },
    { label: "5", isCorrect: false },
  ],
  ...overrides,
});

export const shortAnswer = (overrides: Record<string, unknown> = {}) => ({
  type: "short_answer",
  prompt: "Sebutkan ibu kota Indonesia.",
  explanation: "Jakarta (sebelum IKN).",
  points: 2,
  acceptedAnswers: ["Jakarta"],
  ...overrides,
});

// A scenario with a 2-criterion template rubric, inserted straight into the DB
// (scenarios are reference data; there is no API to author them).
export async function makeScenario() {
  const [subjectRow] = await db.select({ id: subject.id }).from(subject).limit(1);
  if (!subjectRow) throw new Error("tidak ada subject referensi");
  const [template] = await db
    .insert(rubric)
    .values({ name: `Template ${crypto.randomUUID().slice(0, 6)}`, isTemplate: true })
    .returning({ id: rubric.id });
  if (!template) throw new Error("rubrik gagal dibuat");
  await db.insert(rubricCriterion).values([
    { rubricId: template.id, label: "Penalaran", description: "Alur berpikir.", maxPoints: "60.00", position: 1 },
    { rubricId: template.id, label: "Ketepatan", description: "Hasil akhir.", maxPoints: "40.00", position: 2 },
  ]);
  const [created] = await db
    .insert(scenario)
    .values({
      subjectId: subjectRow.id,
      title: "Scenario uji",
      instructions: "Selesaikan masalah berikut dengan alasan.",
      defaultRubricId: template.id,
    })
    .returning({ id: scenario.id, defaultRubricId: scenario.defaultRubricId });
  if (!created) throw new Error("scenario gagal dibuat");
  return created;
}

export function expectNoKeys(value: unknown, forbidden: string[], path = "$"): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...expectNoKeys(item, forbidden, `${path}[${index}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (forbidden.includes(key)) found.push(`${path}.${key}`);
      found.push(...expectNoKeys(inner, forbidden, `${path}.${key}`));
    }
  }
  return found;
}

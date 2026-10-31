import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { env } from "../src/config/env";
import { setLogSink } from "../src/lib/log";
import { tutorSessionLimiter } from "../src/modules/ai-tutor/ai-tutor.service";
import { api, joinCourse, makeCourse, makePdf, multipart, newUser, publishCourse } from "./helpers";

const lines: Array<{ level: string; line: string }> = [];
const realFetch = globalThis.fetch;
let mintBodies: any[] = [];
let mintStatus = 200;

beforeEach(() => {
  lines.length = 0;
  mintBodies = [];
  mintStatus = 200;
  setLogSink((level, line) => lines.push({ level, line }));
  (env as any).geminiApiKey = "AIzaSyTestKeyThatMustNeverBeLogged0000000";
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    if (String(url).includes("auth_tokens")) {
      mintBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return mintStatus === 200
        ? new Response(JSON.stringify({ name: "auth_tokens/test-token" }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ error: { message: "key AIzaSyTestKeyThatMustNeverBeLogged0000000 rejected" } }), { status: mintStatus, headers: { "content-type": "application/json" } });
    }
    return realFetch(url, init);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  (env as any).geminiApiKey = undefined;
  setLogSink(null);
});

async function pdfStudent() {
  const teacher = await newUser("health-teacher");
  const student = await newUser("health-student");
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  await joinCourse(student, course.joinCode);
  const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: "M", status: "published" });
  const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, { title: "L", status: "published" });
  const upload = await multipart(teacher, "POST", `/api/manage/lessons/${lesson.body.id}/resources/upload`, { title: "Materi", file: { name: "materi.pdf", bytes: makePdf("x") } });
  return { student, resourceId: upload.body.id as string };
}

describe("PDF tutor session endpoint", () => {
  test("a session is minted with the 10-minute cap and a 2-minute start window", async () => {
    const { student, resourceId } = await pdfStudent();
    const reply = await api(student, "POST", "/api/student/ai-tutor/pdf-sessions", { resourceId });
    expect(reply.status).toBe(201);
    expect(reply.body.maxSessionSeconds).toBe(600);
    const newSessionExpire = Date.parse(mintBodies[0].newSessionExpireTime);
    expect(newSessionExpire - Date.now()).toBeGreaterThan(100_000);
    expect(newSessionExpire - Date.now()).toBeLessThanOrEqual(121_000);
  });

  test("a failed mint is logged without the key", async () => {
    const { student, resourceId } = await pdfStudent();
    mintStatus = 500;
    const reply = await api(student, "POST", "/api/student/ai-tutor/pdf-sessions", { resourceId });
    expect(reply.status).toBe(503);
    expect(reply.body.code).toBe("AI_TUTOR_SESSION_FAILED");
    const logged = lines.find(({ line }) => line.includes('"event":"tutor_session_mint_failed"'));
    expect(logged?.level).toBe("error");
    expect(JSON.parse(logged!.line)).toMatchObject({ surface: "pdf", userId: student.id });
    expect(logged?.line).not.toContain("AIzaSyTestKey");
  });

  test("hitting the per-account limit says how long to wait, in the body and in Retry-After", async () => {
    const { student, resourceId } = await pdfStudent();
    tutorSessionLimiter.reset(student.id);
    for (let i = 0; i < 30; i += 1) {
      expect((await api(student, "POST", "/api/student/ai-tutor/pdf-sessions", { resourceId })).status).toBe(201);
    }
    const reply = await api(student, "POST", "/api/student/ai-tutor/pdf-sessions", { resourceId });
    expect(reply.status).toBe(429);
    expect(reply.body.code).toBe("AI_TUTOR_RATE_LIMITED");
    expect(reply.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(reply.body.retryAfterSeconds).toBeLessThanOrEqual(600);
    expect(reply.headers.get("retry-after")).toBe(String(reply.body.retryAfterSeconds));
    tutorSessionLimiter.reset(student.id);
  });
});

describe("client session events", () => {
  const valid = { surface: "pdf", event: "connect_failed", kind: "quota", phase: "connect", code: 1011, ageMs: 1800, attempt: 1,
    reason: "You exceeded your current quota. key=AIzaSyTestKeyThatMustNeverBeLogged0000000 token auth_tokens/abc123" };

  test("requires sign-in and a well-formed body", async () => {
    const student = await newUser("event-student");
    expect((await api(null, "POST", "/api/student/ai-tutor/session-events", valid)).status).toBe(401);
    expect((await api(student, "POST", "/api/student/ai-tutor/session-events", { ...valid, surface: "elsewhere" })).status).toBe(400);
    expect((await api(student, "POST", "/api/student/ai-tutor/session-events", { ...valid, kind: "made-up" })).status).toBe(400);
    expect((await api(student, "POST", "/api/student/ai-tutor/session-events", { ...valid, code: -1 })).status).toBe(400);
    expect((await api(student, "POST", "/api/student/ai-tutor/session-events", { ...valid, reason: 42 })).status).toBe(400);
  });

  test("a session closed for being idle is accepted", async () => {
    const student = await newUser("event-idle");
    const reply = await api(student, "POST", "/api/student/ai-tutor/session-events", { surface: "quiz", event: "idle_closed", phase: "live", ageMs: 60_000 });
    expect(reply.status).toBe(204);
  });

  test("response timeout, recovery and empty response events are accepted without logging question content", async () => {
    const student = await newUser("event-response");
    for (const event of ["response_timeout", "response_recovery", "empty_response"]) {
      const reply = await api(student, "POST", "/api/student/ai-tutor/session-events", {
        surface: "pdf", event, phase: "live", attempt: 1,
        reason: "text-sent, tool-requested, context-read, tool-response-sent",
      });
      expect(reply.status).toBe(204);
    }
    const timeout = lines.find(({ line }) => line.includes('"name":"response_timeout"'));
    expect(timeout?.level).toBe("warn");
    const empty = lines.find(({ line }) => line.includes('"name":"empty_response"'));
    expect(empty?.level).toBe("warn");
  });

  test("a failure report is logged as a warning, redacted and trimmed to known fields", async () => {
    const student = await newUser("event-student");
    const reply = await api(student, "POST", "/api/student/ai-tutor/session-events", { ...valid, injected: "ignore me" });
    expect(reply.status).toBe(204);
    const logged = lines.find(({ line }) => line.includes('"event":"tutor_client_event"'));
    expect(logged?.level).toBe("warn");
    const parsed = JSON.parse(logged!.line);
    expect(parsed).toMatchObject({ event: "tutor_client_event", userId: student.id, name: "connect_failed", surface: "pdf", kind: "quota", code: 1011, ageMs: 1800 });
    expect(parsed.reason).toContain("exceeded your current quota");
    expect(logged!.line).not.toContain("AIzaSyTestKey");
    expect(logged!.line).not.toContain("auth_tokens/abc123");
    expect(parsed.injected).toBeUndefined();
  });

  test("a flood from one account is dropped quietly after the cap", async () => {
    const student = await newUser("event-flood");
    for (let i = 0; i < 125; i += 1) {
      expect((await api(student, "POST", "/api/student/ai-tutor/session-events", { surface: "quiz", event: "closed" })).status).toBe(204);
    }
    expect(lines.filter(({ line }) => line.includes('"event":"tutor_client_event"'))).toHaveLength(120);
  });
});

import { afterEach, expect, spyOn, test } from "bun:test";
import { mintTutorToken } from "../src/modules/ai-tutor/openai-session";
import { assessmentTutorConfig } from "../src/modules/ai-tutor/live-tutor.config";

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

test("tutor credentials carry server instructions and use separate connection and session expirations", async () => {
  const expires = Math.floor(Date.now() / 1000) + 60;
  let request: { headers?: HeadersInit; body?: BodyInit | null } | undefined;
  const mock = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (_url: RequestInfo | URL, init?: RequestInit) => {
    request = init;
    return Response.json({ value: "ek_short_lived", expires_at: expires });
  }, { preconnect: () => {} }));
  restore = () => mock.mockRestore();
  const config = assessmentTutorConfig("Server-only course context");
  const result = await mintTutorToken("sk_server_only", config, "student-123");
  const body = JSON.parse(String(request?.body));
  expect(body.session.instructions).toBe("Server-only course context");
  expect(body.session.tool_choice).toEqual({ type: "function", name: "classify_student_prompt" });
  expect(body.expires_after).toEqual({ anchor: "created_at", seconds: 60 });
  expect(new Headers(request?.headers).get("OpenAI-Safety-Identifier")).toBe("student-123");
  expect(result.token).toBe("ek_short_lived");
  expect(result.tokenExpiresAt).toBe(new Date(expires * 1000).toISOString());
  expect(Date.parse(result.expiresAt) - Date.parse(result.tokenExpiresAt)).toBeGreaterThan(50 * 60_000);
  expect(JSON.stringify(result)).not.toContain("sk_server_only");
});

test("upstream failures never expose credentials or upstream response bodies", async () => {
  const mock = spyOn(globalThis, "fetch").mockResolvedValue(new Response("sk_server_only and private diagnostics", { status: 429 }));
  restore = () => mock.mockRestore();
  await expect(mintTutorToken("sk_server_only", assessmentTutorConfig("private"), "student-123"))
    .rejects.toThrow("OpenAI request failed (429)");
});

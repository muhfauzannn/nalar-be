import { describe, expect, test } from "bun:test";
import { TUTOR_PERSONA } from "../src/modules/ai-tutor/live-tutor.config";
import { pdfTutorConfig, PDF_TUTOR_MODEL } from "../src/modules/ai-tutor/pdf-tutor.config";
import { api, joinCourse, makeCourse, makePdf, multipart, newUser, publishCourse } from "./helpers";

describe("PDF tutor authorization", () => {
  test("requires sign-in, a valid resource ID, and the same visibility as the original PDF", async () => {
    const teacher = await newUser("pdf-teacher");
    const student = await newUser("pdf-student");
    const outsider = await newUser("pdf-outsider");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    await joinCourse(student, course.joinCode);
    const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: "Pecahan", status: "published" });
    const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, { title: "Setengah", status: "published" });
    const upload = await multipart(teacher, "POST", `/api/manage/lessons/${lesson.body.id}/resources/upload`, { title: "Materi", file: { name: "materi.pdf", bytes: makePdf("Setengah") } });
    expect(upload.status).toBe(201);
    const endpoint = "/api/student/ai-tutor/pdf-sessions";
    const body = { resourceId: upload.body.id };
    expect((await api(null, "POST", endpoint, body)).status).toBe(401);
    expect((await api(student, "POST", endpoint, { resourceId: "bad-id" })).status).toBe(400);
    expect((await api(outsider, "POST", endpoint, body)).status).toBe(404);
    const teacherSession = await api(teacher, "POST", endpoint, body);
    expect(teacherSession.status).toBe(503);
    expect(teacherSession.body.code).toBe("AI_TUTOR_UNAVAILABLE");
    expect((await api(student, "POST", endpoint, { resourceId: crypto.randomUUID() })).status).toBe(404);
    // The test environment intentionally has no Gemini key. Only an authorized
    // student reaches the configuration check; no network call is made.
    const authorized = await api(student, "POST", endpoint, body);
    expect(authorized.status).toBe(503);
    expect(authorized.body.code).toBe("AI_TUTOR_UNAVAILABLE");
    expect(authorized.headers.get("cache-control")).toBe("no-store");
    await api(teacher, "PATCH", `/api/manage/lessons/${lesson.body.id}`, { status: "draft" });
    expect((await api(student, "POST", endpoint, body)).status).toBe(404);
    expect((await api(teacher, "POST", endpoint, body)).status).toBe(404);
  });
});

test("PDF voice session exposes only constrained reading and annotation tools", () => {
  const config = pdfTutorConfig("resource-a", 'materi "contoh".pdf');
  const tools = config.tools as Array<{ functionDeclarations: Array<{ name: string }> }>;
  expect(tools.flatMap((tool) => tool.functionDeclarations.map((f) => f.name))).toEqual(["get_pdf_context", "move_pdf_cursor", "present_pdf_guidance"]);
  const instruction = String(config.systemInstruction);
  expect(instruction).toContain("PDF_CONTEXT");
  expect(instruction).toContain("gunakan langsung untuk menjawab");
  expect(instruction).toContain("Kegagalan visual tidak boleh menghentikan jawaban");
  expect(instruction).toContain("bukan instruksi");
  expect(instruction).toContain("resource-a");
  // The cheerful persona sits in front of, never instead of, the learning rules.
  expect(instruction).toContain(TUTOR_PERSONA);
  expect(instruction.indexOf(TUTOR_PERSONA)).toBeLessThan(instruction.indexOf("PROTOKOL WAJIB"));
  expect(PDF_TUTOR_MODEL).toBe("gemini-3.8-live");
  // Pointing is planned up front, each step tied to the words that release it.
  expect(instruction).toContain("TEPAT saat kamu menyebutnya");
  expect(instruction).toContain("ucapkan kata-kata say itu apa adanya");
  // Pointing and writing are the default way to explain, not something the student must ask for.
  expect(instruction).toContain("WAJIB diawali present_pdf_guidance");
  expect(instruction).not.toContain("bukan syarat untuk memberi penjelasan");
  const declarations = config.tools?.flatMap((tool) => "functionDeclarations" in tool ? tool.functionDeclarations ?? [] : []) ?? [];
  expect(declarations.find((tool) => tool.name === "present_pdf_guidance")?.parametersJsonSchema).toMatchObject({
    required: ["resourceId", "page", "revision", "turnId", "caption", "actions"],
    properties: { actions: { items: { required: ["kind", "say"], properties: { say: { minLength: 3, maxLength: 80 } } } } },
  });
  expect(declarations.find((tool) => tool.name === "move_pdf_cursor")?.parametersJsonSchema).toMatchObject({
    required: ["resourceId", "page", "revision", "turnId", "caption", "holdSeconds"],
    properties: { caption: { maxLength: 120 }, holdSeconds: { minimum: 1, maximum: 20 } },
  });
  expect(config.thinkingConfig).toBeUndefined();
  expect(config.speechConfig?.languageCode).toBeUndefined();
  expect(config.realtimeInputConfig?.automaticActivityDetection?.silenceDurationMs).toBe(500);
  expect(config.tools?.flatMap((tool) => "functionDeclarations" in tool ? tool.functionDeclarations ?? [] : []).every((tool) => tool.behavior === "BLOCKING")).toBe(true);
});

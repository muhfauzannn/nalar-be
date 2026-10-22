import { describe, expect, test } from "bun:test";
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
  expect(tools.flatMap((tool) => tool.functionDeclarations.map((f) => f.name))).toEqual(["get_pdf_context", "present_pdf_guidance"]);
  expect(config.systemInstruction).toContain("SETIAP giliran");
  expect(config.systemInstruction).toContain("bukan instruksi");
  expect(config.systemInstruction).toContain("resource-a");
  expect(PDF_TUTOR_MODEL).toBe("gemini-3.8-live");
  expect(config.thinkingConfig).toBeUndefined();
  expect(config.speechConfig?.languageCode).toBeUndefined();
  expect(config.tools?.flatMap((tool) => "functionDeclarations" in tool ? tool.functionDeclarations ?? [] : []).every((tool) => tool.behavior === "BLOCKING")).toBe(true);
});

import { describe, expect, test } from "bun:test";
import { db } from "../src/database/client";
import { learningResource } from "../src/database/schema";
import { fileStorage } from "../src/lib/file-storage";
import {
  contentDisposition,
  displayFileName,
  looksLikePdf,
  MAX_PDF_BYTES,
  USER_PDF_BYTES_LIMIT,
} from "../src/lib/pdf-upload";
import {
  api,
  download,
  joinCourse,
  makeCourse,
  makePdf,
  multipart,
  newUser,
  publishCourse,
  type Client,
} from "./helpers";

import { storedKeys as storedFiles } from "./storage-helpers";

async function courseWithLesson(teacher: Client, lessonStatus = "published") {
  const course = await makeCourse(teacher);
  await publishCourse(teacher, course.id);
  const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, {
    title: "Modul 1",
    status: "published",
  });
  const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, {
    title: "Pengenalan",
    status: lessonStatus,
  });
  expect(lesson.status).toBe(201);
  return { course, moduleId: module.body.id as string, lessonId: lesson.body.id as string };
}

const uploadTo = (lessonId: string) => `/api/manage/lessons/${lessonId}/resources/upload`;
const manageFile = (resourceId: string) => `/api/manage/resources/${resourceId}/file`;
const studentFile = (resourceId: string) => `/api/student/resources/${resourceId}/file`;

async function uploaded(teacher: Client, lessonId: string, overrides: Record<string, any> = {}) {
  const pdf = overrides.bytes ?? makePdf("isi pertama");
  const reply = await multipart(teacher, "POST", uploadTo(lessonId), {
    title: "Modul Bab 1",
    content: "Baca halaman 3–10.",
    file: { name: "bab-1.pdf", bytes: pdf },
    ...overrides.fields,
  });
  expect(reply.status).toBe(201);
  return { id: reply.body.id as string, pdf };
}

describe("uploading a PDF resource", () => {
  test("the teacher uploads, the enrolled student reads the same bytes, and no storage key leaks", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);

    const { id, pdf } = await uploaded(teacher, lessonId);

    const lesson = await api(student, "GET", `/api/student/lessons/${lessonId}`);
    expect(lesson.body.resources).toHaveLength(1);
    expect(lesson.body.resources[0]).toMatchObject({
      id,
      type: "file",
      title: "Modul Bab 1",
      content: "Baca halaman 3–10.",
      url: null,
      file: { name: "bab-1.pdf", size: pdf.length },
    });

    const editor = await api(teacher, "GET", `/api/manage/lessons/${lessonId}`);
    expect(editor.body.resources[0]).toMatchObject({ id, url: null, file: { name: "bab-1.pdf", size: pdf.length } });
    const courseEditor = await api(teacher, "GET", `/api/manage/courses/${course.id}`);
    expect(JSON.stringify(courseEditor.body)).toContain('"file":{"name":"bab-1.pdf"');

    // the storage key is an internal detail
    for (const body of [lesson.body, editor.body, courseEditor.body]) {
      expect(JSON.stringify(body)).not.toMatch(/fileKey|file_key|resources\/[0-9a-f]{8}-/);
    }

    for (const [who, path] of [
      [student, studentFile(id)],
      [teacher, manageFile(id)],
    ] as const) {
      const res = await download(who, path);
      expect(res.status).toBe(200);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("cache-control")).toContain("private");
      expect(res.headers.get("content-disposition")).toStartWith('inline; filename="bab-1.pdf"');
    }

    const saved = await download(student, `${studentFile(id)}?download=1`);
    expect(saved.headers.get("content-disposition")).toStartWith("attachment;");
  });

  test("only people entitled to the lesson can open the file", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const outsider = await newUser("outsider");
    const otherTeacher = await newUser("other-teacher");
    const other = await courseWithLesson(otherTeacher);
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);
    const { id } = await uploaded(teacher, lessonId);

    expect((await download(null, studentFile(id))).status).toBe(401);
    expect((await download(null, manageFile(id))).status).toBe(401);
    // not enrolled / enrolled elsewhere / teaching elsewhere: same answer as "no such file"
    expect((await download(outsider, studentFile(id))).status).toBe(404);
    expect((await download(otherTeacher, studentFile(id))).status).toBe(404);
    expect((await download(otherTeacher, manageFile(id))).status).toBe(404);
    // Students cannot manage files; the auto-enrolled teacher can test the learning view.
    expect((await download(student, manageFile(id))).status).toBe(404);
    expect((await api(teacher, "GET", `/api/student/lessons/${lessonId}`)).status).toBe(200);
    expect((await download(teacher, studentFile(id))).status).toBe(200);
    expect((await download(student, studentFile(crypto.randomUUID()))).status).toBe(404);
    expect((await download(student, studentFile("bukan-uuid"))).status).toBe(400);

    // another teacher cannot attach files to, or take over, this lesson/resource
    const pdf = { name: "x.pdf", bytes: makePdf("x") };
    expect((await multipart(otherTeacher, "POST", uploadTo(lessonId), { title: "T", file: pdf })).status).toBe(404);
    expect((await multipart(otherTeacher, "PUT", manageFile(id), { title: "T", file: pdf })).status).toBe(404);
    expect(other.lessonId).not.toBe(lessonId);

    // a lesson hidden from students hides its files too, a teacher still sees them
    await api(teacher, "PATCH", `/api/manage/lessons/${lessonId}`, { status: "draft" });
    expect((await download(student, studentFile(id))).status).toBe(404);
    expect((await download(teacher, studentFile(id))).status).toBe(404);
    expect((await download(teacher, manageFile(id))).status).toBe(200);
    await api(teacher, "PATCH", `/api/manage/lessons/${lessonId}`, { status: "published" });
    expect((await download(student, studentFile(id))).status).toBe(200);
  });

  test("anything that is not a real, reasonably sized PDF is refused and leaves nothing on disk", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const before = (await storedFiles()).length;
    const send = (fields: Parameters<typeof multipart>[3]) =>
      multipart(teacher, "POST", uploadTo(lessonId), fields);
    const text = new TextEncoder().encode("<html><script>alert(1)</script></html>");

    // the declared type and the name say PDF; the bytes do not
    const fake = await send({ title: "Palsu", file: { name: "palsu.pdf", type: "application/pdf", bytes: text } });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toContain("PDF");
    expect((await send({ title: "Kosong", file: { name: "k.pdf", bytes: new Uint8Array() } })).status).toBe(400);
    expect((await send({ title: "Tanpa file" })).status).toBe(400);
    expect((await send({ file: { name: "x.pdf", bytes: makePdf() } })).status).toBe(400);
    expect((await send({ title: "x".repeat(161), file: { name: "x.pdf", bytes: makePdf() } })).status).toBe(400);
    expect((await api(teacher, "POST", uploadTo(lessonId), { title: "JSON" })).status).toBe(400);

    // a little over the limit still reaches validation; far over is stopped before it is read
    const slightlyOver = await send({ title: "Besar", file: { name: "b.pdf", bytes: makePdf("", MAX_PDF_BYTES + 1) } });
    expect(slightlyOver.status).toBe(400);
    expect(slightlyOver.body.error).toContain("terlalu besar");
    const wayOver = await send({ title: "Raksasa", file: { name: "r.pdf", bytes: makePdf("", MAX_PDF_BYTES + 2 * 1024 * 1024) } });
    expect(wayOver.status).toBe(413);

    // exactly at the limit is fine
    expect((await send({ title: "Pas", file: { name: "p.pdf", bytes: makePdf("", MAX_PDF_BYTES) } })).status).toBe(201);

    expect((await storedFiles()).length).toBe(before + 1);
    const editor = await api(teacher, "GET", `/api/manage/lessons/${lessonId}`);
    expect(editor.body.resources).toHaveLength(1);
  });

  test("a hostile file name cannot reach the disk or the response headers", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);
    const before = new Set(await storedFiles());

    const names = [
      "../../etc/passwd",
      '..\\..\\windows\\evil".pdf',
      'a"; filename="b.pdf',
      "baris\r\nSet-Cookie: x=1.pdf",
      "Ringkasan Bab ½ — énergie.PDF",
      `${"panjang".repeat(60)}.pdf`,
    ];
    const ids: string[] = [];
    for (const name of names) {
      const reply = await multipart(teacher, "POST", uploadTo(lessonId), {
        title: "Judul",
        file: { name, bytes: makePdf(name) },
      });
      expect(reply.status).toBe(201);
      ids.push(reply.body.id);
    }

    const created = (await storedFiles()).filter((file) => !before.has(file));
    expect(created).toHaveLength(names.length);
    for (const file of created) expect(file).toMatch(/^resources\/[0-9a-f-]{36}\.pdf$/);

    const editor = await api(teacher, "GET", `/api/manage/lessons/${lessonId}`);
    const shown = editor.body.resources.map((resource: any) => resource.file.name);
    expect(shown[0]).toBe("passwd.pdf");
    expect(shown[4]).toBe("Ringkasan Bab ½ — énergie.pdf");
    expect(shown[5].length).toBeLessThanOrEqual(124);
    // (the form encoder already percent-encodes quotes and newlines on the wire)
    for (const name of shown) expect(name).toMatch(/^[^\r\n"\\/<>:|?*\u0000-\u001f]+\.pdf$/);

    for (const id of ids) {
      const res = await download(student, studentFile(id));
      expect(res.status).toBe(200);
      const header = res.headers.get("content-disposition") ?? "";
      expect(header).not.toMatch(/[\r\n]/);
      // a quoted ASCII fallback that cannot contain a quote, then the percent-encoded real name
      expect(header).toMatch(/^(inline|attachment); filename="[^"\\\r\n]*"; filename\*=UTF-8''[A-Za-z0-9%._~!-]*$/);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("changing and removing an uploaded resource", () => {
  const files = (lessonId: string, teacher: Client) =>
    api(teacher, "GET", `/api/manage/lessons/${lessonId}`).then((reply) => reply.body.resources);

  test("replacing the file swaps the bytes, updates the words and deletes the old file", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);
    const preexisting = new Set(await storedFiles());
    const { id } = await uploaded(teacher, lessonId);
    const mine = async () => (await storedFiles()).filter((file) => !preexisting.has(file));
    const [first] = await mine();

    const next = makePdf("versi dua", 4096);
    const replaced = await multipart(teacher, "PUT", manageFile(id), {
      title: "Modul Bab 1 (revisi)",
      file: { name: "bab-1-v2.pdf", bytes: next },
    });
    expect(replaced.status).toBe(200);

    expect(new Uint8Array(await (await download(student, studentFile(id))).arrayBuffer())).toEqual(next);
    expect((await files(lessonId, teacher))[0]).toMatchObject({
      id,
      title: "Modul Bab 1 (revisi)",
      content: null,
      file: { name: "bab-1-v2.pdf", size: 4096 },
    });
    const after = await mine();
    expect(after).toHaveLength(1); // one in, one out
    expect(after[0]).not.toBe(first);
  });

  test("a URL-only 'file' resource can be converted to an upload, and then has no URL", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const legacy = await api(teacher, "POST", `/api/manage/lessons/${lessonId}/resources`, {
      type: "file",
      title: "Drive",
      url: "https://example.org/a.pdf",
    });
    expect(legacy.status).toBe(201);

    // without a URL and without an upload there is nothing to keep
    const nothing = await api(teacher, "PATCH", `/api/manage/resources/${legacy.body.id}`, { type: "file", title: "Drive" });
    expect(nothing.status).toBe(400);

    const converted = await multipart(teacher, "PUT", manageFile(legacy.body.id), {
      title: "Drive",
      file: { name: "a.pdf", bytes: makePdf("a") },
    });
    expect(converted.status).toBe(200);
    expect((await files(lessonId, teacher))[0]).toMatchObject({ url: null, file: { name: "a.pdf" } });
  });

  test("editing only the words keeps the file; turning it into a link removes the file", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);
    const { id, pdf } = await uploaded(teacher, lessonId);
    const before = (await storedFiles()).length;

    const words = await api(teacher, "PATCH", `/api/manage/resources/${id}`, {
      type: "file",
      title: "Judul baru",
      content: "",
    });
    expect(words.status).toBe(200);
    expect((await files(lessonId, teacher))[0]).toMatchObject({ title: "Judul baru", content: null, file: { name: "bab-1.pdf" } });
    expect(new Uint8Array(await (await download(student, studentFile(id))).arrayBuffer())).toEqual(pdf);
    expect((await storedFiles()).length).toBe(before);

    const toLink = await api(teacher, "PATCH", `/api/manage/resources/${id}`, {
      type: "link",
      title: "Sekarang tautan",
      url: "https://example.org/",
    });
    expect(toLink.status).toBe(200);
    expect((await files(lessonId, teacher))[0]).toMatchObject({ type: "link", url: "https://example.org/", file: null });
    expect((await storedFiles()).length).toBe(before - 1);
    expect((await download(student, studentFile(id))).status).toBe(404);
  });

  test("deleting the resource deletes its file", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const { course, lessonId } = await courseWithLesson(teacher);
    await joinCourse(student, course.joinCode);
    const { id } = await uploaded(teacher, lessonId);
    const before = (await storedFiles()).length;

    expect((await api(teacher, "DELETE", `/api/manage/resources/${id}`)).status).toBe(200);
    expect((await storedFiles()).length).toBe(before - 1);
    expect((await download(student, studentFile(id))).status).toBe(404);
    expect((await download(teacher, manageFile(id))).status).toBe(404);
  });

  test("a row whose file vanished from disk answers 404 instead of crashing", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const before = new Set(await storedFiles());
    const { id } = await uploaded(teacher, lessonId);
    const [gone] = (await storedFiles()).filter((file) => !before.has(file));
    await fileStorage.remove(gone as string);

    const res = await download(teacher, manageFile(id));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("penyimpanan");
  });
});

describe("storage limits", () => {
  // Rows are inserted directly: the point is the arithmetic, not writing hundreds of MB.
  async function fill(lessonId: string, bytes: number) {
    const [row] = await db
      .insert(learningResource)
      .values({
        lessonId,
        position: 40,
        type: "file",
        title: "Pengisi",
        fileKey: `resources/${crypto.randomUUID()}.pdf`,
        fileName: "pengisi.pdf",
        fileSize: bytes,
      })
      .returning({ id: learningResource.id });
    return row?.id as string;
  }

  test("an account that is full cannot upload more until it frees space; replacing counts the old size", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const fillerId = await fill(lessonId, USER_PDF_BYTES_LIMIT - 1024);
    const small = { name: "s.pdf", bytes: makePdf("kecil", 2048) };

    const refused = await multipart(teacher, "POST", uploadTo(lessonId), { title: "Tambahan", file: small });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("LIMIT_REACHED");

    // swapping the big file for a small one is a net decrease, so it is allowed
    const swapped = await multipart(teacher, "PUT", manageFile(fillerId), { title: "Pengisi", file: small });
    expect(swapped.status).toBe(200);
    expect((await multipart(teacher, "POST", uploadTo(lessonId), { title: "Tambahan", file: small })).status).toBe(201);
  });

  test("another account's files do not count", async () => {
    const full = await newUser("full");
    const fresh = await newUser("fresh");
    const a = await courseWithLesson(full);
    const b = await courseWithLesson(fresh);
    await fill(a.lessonId, USER_PDF_BYTES_LIMIT);
    const reply = await multipart(fresh, "POST", uploadTo(b.lessonId), {
      title: "Aman",
      file: { name: "a.pdf", bytes: makePdf("aman") },
    });
    expect(reply.status).toBe(201);
  });
});

describe("the resource payload constraint", () => {
  test("a resource is exactly one of: text, URL, or stored file", async () => {
    const teacher = await newUser("teacher");
    const { lessonId } = await courseWithLesson(teacher);
    const key = () => `resources/${crypto.randomUUID()}.pdf`;
    const base = { lessonId, title: "T" };
    let position = 100;
    const insert = async (values: Record<string, unknown>) => {
      await db.insert(learningResource).values({ ...base, position: position++, ...values } as any);
    };

    await insert({ type: "file", fileKey: key(), fileName: "a.pdf", fileSize: 10 });
    await expect(insert({ type: "file", url: "https://x.org", fileKey: key(), fileName: "a.pdf", fileSize: 10 })).rejects.toThrow();
    await expect(insert({ type: "file", fileKey: key(), fileSize: 10 })).rejects.toThrow(); // no name
    await expect(insert({ type: "file", fileKey: key(), fileName: "a.pdf" })).rejects.toThrow(); // no size
    await expect(insert({ type: "file", fileKey: key(), fileName: "a.pdf", fileSize: 0 })).rejects.toThrow();
    await expect(insert({ type: "link", fileKey: key(), fileName: "a.pdf", fileSize: 10 })).rejects.toThrow();
    await expect(insert({ type: "link", url: "https://x.org", fileName: "stray.pdf" })).rejects.toThrow();
    await expect(insert({ type: "text", content: "x", fileKey: key(), fileName: "a.pdf", fileSize: 10 })).rejects.toThrow();
    await expect(insert({ type: "file" })).rejects.toThrow();
    const dup = key();
    await insert({ type: "file", fileKey: dup, fileName: "a.pdf", fileSize: 10 });
    await expect(insert({ type: "file", fileKey: dup, fileName: "b.pdf", fileSize: 10 })).rejects.toThrow(); // key is unique
  });
});

describe("helpers", () => {
  test("only bytes that start with %PDF- are PDFs", () => {
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode(" %PDF-1.7"))).toBe(false);
    expect(looksLikePdf(new TextEncoder().encode("%PDF-"))).toBe(false);
    expect(looksLikePdf(new TextEncoder().encode("PK\u0003\u0004"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });

  test("display names are plain, short and end in .pdf", () => {
    expect(displayFileName("C:\\Users\\guru\\Bab 1.pdf", "Judul")).toBe("Bab 1.pdf");
    expect(displayFileName("../../x/y.PDF", "Judul")).toBe("y.pdf");
    expect(displayFileName("laporan", "Judul")).toBe("laporan.pdf");
    expect(displayFileName(".pdf", "Judul Bab")).toBe("Judul Bab.pdf");
    expect(displayFileName("   ", "")).toBe("Dokumen.pdf");
    expect(displayFileName('a"b<c>d:e|f?g*.pdf', "J")).toBe("a b c d e f g.pdf");
    expect(displayFileName("x".repeat(500), "J").length).toBe(124);
    expect(displayFileName("baris\r\nSet-Cookie: x=1\u0000.pdf", "J")).toBe("baris Set-Cookie x=1.pdf");
  });

  test("Content-Disposition carries an ASCII fallback and the real name, safely encoded", () => {
    expect(contentDisposition("inline", "bab-1.pdf")).toBe(
      `inline; filename="bab-1.pdf"; filename*=UTF-8''bab-1.pdf`,
    );
    expect(contentDisposition("attachment", "Rangkuman Énergie (1).pdf")).toBe(
      `attachment; filename="Rangkuman _nergie (1).pdf"; filename*=UTF-8''Rangkuman%20%C3%89nergie%20%281%29.pdf`,
    );
  });
});

import { expect, test } from "bun:test";
import { formatTutorHistory } from "../src/modules/ai-tutor/ai-tutor.service";
import { pdfTutorConfig } from "../src/modules/ai-tutor/pdf-tutor.config";

test("a reopened assessment session gets the latest turns, newest kept and capped", () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    author: i % 2 ? "tutor" : "student",
    content: `pesan   ${i}\n`,
  }));
  const lines = formatTutorHistory(messages);
  expect(lines).toHaveLength(12);
  expect(lines[0]).toBe("Siswa: pesan 8");
  expect(lines.at(-1)).toBe("Tutor: pesan 19");

  const long = formatTutorHistory(
    Array.from({ length: 12 }, () => ({ author: "student", content: "x".repeat(2_000) })),
  );
  expect(long.every((line) => line.length <= "Siswa: ".length + 601)).toBe(true);
  expect(long.join("\n").length).toBeLessThanOrEqual(4_000);
  expect(long.length).toBeGreaterThan(0);

  expect(formatTutorHistory([{ author: "system", content: "internal" }])).toEqual([]);
});

test("the PDF tutor treats a resent conversation as context, not a new question", () => {
  const instruction = String(pdfTutorConfig("resource-a", "materi.pdf").systemInstruction);
  expect(instruction).toContain("CONVERSATION_HISTORY");
  expect(instruction).toContain("bukan giliran baru");
});

import { describe, expect, test } from "bun:test";
import { classifyPrompt } from "../src/modules/ai-tutor/ai-tutor.service";

// A regression set for the rule-based guard (nalar-guard-v2), written by hand from how students
// really phrase things. It is NOT an accuracy estimate: the rules were tuned to these lines. The
// real figure needs prompts labelled by teachers (PRD 7.2).

const asksForTheAnswer = [
  // Said to the real tutor on 3 Nov 2026 and classified as a hint 8 times out of 8 by guard v1.
  "Udah deh, kasih tahu aja jawaban misi pertama langsung dong.",
  "kasih tau jawabannya dong",
  "Kasih tahu aku jawabannya",
  "beri tahu jawabannya",
  "Bilangin jawabannya dong",
  "jawabannya aja",
  "jawabannya langsung",
  "Apa jawabannya?",
  "jawabannya apa?",
  "minta jawabannya",
  "Aku mau jawabannya dong",
  "Aku ingin tahu jawaban yang benar",
  "langsung kasih jawabannya",
  "langsung aja jawab soalnya",
  "Langsung bilang aja hasilnya",
  "tolong jawabin soal ini",
  "Kerjain soal ini dong",
  "Kerjakan tugas ini",
  "kunci jawabannya mana?",
  "Tulisin jawaban akhirnya",
  "Jangan lama-lama, kasih jawabannya sekarang",
  "Pilih opsi yang benar",
  "just give me the answer",
  "What's the answer?",
  "please solve this",
];

// Asking for help, for a hint, for a check of one's own work, or telling the tutor NOT to give it away.
const doesNotAsk = [
  "Jangan langsung kasih tahu jawabannya ya, kasih petunjuk aja.",
  "Jangan kasih jawabannya dulu, aku mau coba sendiri.",
  "Nggak usah langsung kasih jawabannya, kasih clue aja",
  "Don't just give me the answer, give me a hint",
  "Gimana cara menemukan jawabannya?",
  "Bisa kasih tahu cara menghitung amplitudo?",
  "Kasih tahu aku konsep periode dong.",
  "Aku sudah ketemu jawabannya, boleh dicek penalaranku?",
  "Jawabanku sudah benar belum?",
  "Kenapa jawabanku masih kurang?",
  "Aku sudah kerjakan soal ini, tolong periksa langkahku.",
  "Langsung ke inti aja, bagian mana yang perlu kuperbaiki?",
  "Aku mau tahu kenapa jawabannya begitu.",
  "Apa yang dimaksud dengan jawaban yang tepat?",
  "Boleh minta petunjuk dulu?",
  "Tolong jelasin cara kerja engkol.",
];

describe("the guard recognises a request for the answer, whatever the activity", () => {
  for (const text of asksForTheAnswer) {
    test(`"${text}"`, () => {
      for (const target of ["assignment", "quiz", "lab"] as const) {
        expect(classifyPrompt(text, target)).toEqual({ intent: "direct_answer", confidence: 0.94, isFallback: false });
      }
    });
  }
});

describe("the guard leaves help, hints and 'do not tell me' alone", () => {
  for (const text of doesNotAsk) {
    test(`"${text}"`, () => {
      for (const target of ["assignment", "lab"] as const) {
        expect(classifyPrompt(text, target).intent).not.toBe("direct_answer");
      }
    });
  }
});

describe("the other intents still win when nothing asks for the answer", () => {
  test("an evaluation of the student's own work is reflective", () => {
    expect(classifyPrompt("Tolong cek logika berpikirku", "assignment").intent).toBe("reflective_evaluative");
    expect(classifyPrompt("Apa yang kurang dari jawabanku?", "assignment").intent).toBe("reflective_evaluative");
  });

  test("a plain question is a hint request, and a one-word message is a low-confidence one", () => {
    expect(classifyPrompt("Apa itu amplitudo?", "assignment")).toEqual({ intent: "explanation_hint", confidence: 0.8, isFallback: false });
    expect(classifyPrompt("hmm", "assignment")).toEqual({ intent: "explanation_hint", confidence: 0.55, isFallback: true });
  });

  test("the quiz and lab rules still catch what only they know", () => {
    expect(classifyPrompt("Apakah jawaban saya benar?", "quiz").intent).toBe("direct_answer");
    expect(classifyPrompt("Berapa sudut yang benar?", "lab").intent).toBe("direct_answer");
    expect(classifyPrompt("Apakah jawaban saya benar?", "assignment").intent).not.toBe("direct_answer");
  });
});

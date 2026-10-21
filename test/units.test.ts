import { describe, expect, test } from "bun:test";

import { generateJoinCode, JOIN_CODE_LENGTH, normalizeJoinCode } from "../src/lib/join-code";
import {
  describeQuizProblems,
  normalizeShortAnswer,
  quizDefinitionsAreReady,
  type QuizDefinitionRow,
} from "../src/lib/quiz-readiness";
import { createRateLimiter } from "../src/lib/rate-limit";

describe("join codes", () => {
  test("generated codes use only unambiguous characters and have a fixed length", () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    }
  });

  test("codes do not repeat in a large sample and every symbol is reachable", () => {
    const seen = new Set<string>();
    const symbols = new Set<string>();
    for (let index = 0; index < 5_000; index += 1) {
      const code = generateJoinCode();
      seen.add(code);
      for (const symbol of code) symbols.add(symbol);
    }
    expect(seen.size).toBe(5_000);
    expect(symbols.size).toBe(31);
  });

  test("normalization accepts what people paste and rejects what cannot be a code", () => {
    expect(normalizeJoinCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeJoinCode("ab cd ef gh")).toBe("ABCDEFGH");
    expect(normalizeJoinCode("")).toBeNull();
    expect(normalizeJoinCode("AB")).toBeNull();
    expect(normalizeJoinCode("ABCD'; DROP TABLE course;--")).toBeNull();
    expect(normalizeJoinCode("A".repeat(33))).toBeNull();
  });
});

describe("failure rate limiter", () => {
  function clocked() {
    let now = 1_000_000;
    const limiter = createRateLimiter({ maxEvents: 3, windowMs: 60_000, now: () => now });
    return { limiter, advance: (ms: number) => (now += ms) };
  }

  test("allows up to the limit, then blocks and reports when to retry", () => {
    const { limiter, advance } = clocked();
    for (let index = 0; index < 3; index += 1) {
      expect(limiter.check("user").allowed).toBe(true);
      limiter.record("user");
      advance(1_000);
    }
    const decision = limiter.check("user");
    expect(decision.allowed).toBe(false);
    // The oldest failure was 3s ago, so 57s of the 60s window remain.
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 57 });
  });

  test("failures expire after the window and keys are independent", () => {
    const { limiter, advance } = clocked();
    for (let index = 0; index < 3; index += 1) limiter.record("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    advance(60_001);
    expect(limiter.check("a").allowed).toBe(true);
  });

  test("reset clears a key", () => {
    const { limiter } = clocked();
    for (let index = 0; index < 3; index += 1) limiter.record("a");
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });
});

const row = (overrides: Partial<QuizDefinitionRow>): QuizDefinitionRow => ({
  questionId: "q1",
  questionType: "multiple_choice",
  acceptedAnswers: null,
  points: "1.00",
  optionId: "o1",
  isCorrect: false,
  ...overrides,
});

describe("quiz readiness (shared by students and teachers)", () => {
  test("an empty quiz is not ready", () => {
    expect(quizDefinitionsAreReady([])).toBe(false);
  });

  test("multiple choice needs 2+ options and exactly one correct", () => {
    const ok = [
      row({ optionId: "a", isCorrect: true }),
      row({ optionId: "b", isCorrect: false }),
    ];
    expect(quizDefinitionsAreReady(ok)).toBe(true);
    // one option only
    expect(quizDefinitionsAreReady([row({ optionId: "a", isCorrect: true })])).toBe(false);
    // two correct
    expect(
      quizDefinitionsAreReady([
        row({ optionId: "a", isCorrect: true }),
        row({ optionId: "b", isCorrect: true }),
      ]),
    ).toBe(false);
    // none correct
    expect(
      quizDefinitionsAreReady([
        row({ optionId: "a", isCorrect: false }),
        row({ optionId: "b", isCorrect: false }),
      ]),
    ).toBe(false);
  });

  test("short answer needs at least one accepted answer", () => {
    const base = { questionType: "short_answer" as const, optionId: null, isCorrect: null };
    expect(quizDefinitionsAreReady([row({ ...base, acceptedAnswers: ["e"] })])).toBe(true);
    expect(quizDefinitionsAreReady([row({ ...base, acceptedAnswers: [] })])).toBe(false);
    expect(quizDefinitionsAreReady([row({ ...base, acceptedAnswers: null })])).toBe(false);
  });

  test("problems name the offending question", () => {
    const { problems } = describeQuizProblems([
      row({ questionId: "good", optionId: "a", isCorrect: true }),
      row({ questionId: "good", optionId: "b" }),
      row({ questionId: "bad", optionId: "c", isCorrect: true }),
    ]);
    expect(problems.map((problem) => problem.questionId)).toEqual(["bad"]);
  });

  test("short answers compare case-, space- and unicode-insensitively", () => {
    expect(normalizeShortAnswer("  Bilangan   E ")).toBe("bilangan e");
    expect(normalizeShortAnswer("ｅ")).toBe("e"); // full-width e
  });
});

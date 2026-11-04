// Poin Nalar rules (PRD §5.9). Each rule reads one process behaviour the paper
// looks for and awards it at most once per submission. The inputs are the stage
// texts, the writing signal and the prompt intents only: the AI Offloading Index
// is deliberately not an input, so using AI never costs points and hiding it
// never earns any. Chat volume, time on page and speed are not inputs either.
export const POINT_RULE_VERSION = "nalar-points-v1";

export type ProcessPointKind =
  | "independent_draft"
  | "hint_request"
  | "reflective_question"
  | "critical_evaluation"
  | "substantial_revision"
  | "specific_reflection"
  | "journey_complete";

export type Stage =
  | "1_independent_effort"
  | "2_guided_questioning"
  | "3_ai_evaluation"
  | "4_revision_finalization"
  | "5_reflection";

export type WritingCounts = { pastedChars: number; finalChars: number };

export type PointInputs = {
  completedStages: Stage[];
  texts: Partial<Record<Stage, string>>;
  writing: Partial<Record<"1_independent_effort" | "4_revision_finalization", WritingCounts>>;
  intents: Array<"direct_answer" | "explanation_hint" | "reflective_evaluative">;
};

export type PointAward = { kind: ProcessPointKind; stage: Stage; points: number };

export const POINTS: Record<ProcessPointKind, number> = {
  independent_draft: 20,
  hint_request: 10,
  reflective_question: 15,
  critical_evaluation: 20,
  substantial_revision: 25,
  specific_reflection: 20,
  journey_complete: 10,
};

// A draft counts as the student's own when most of it was typed, not pasted.
const MAX_PASTED_SHARE_DRAFT = 0.4;
const MAX_PASTED_SHARE_REVISION = 0.5;
const MIN_DRAFT_CHARS = 80;
// Share of words that changed between the Stage 1 draft and the Stage 4 text.
const MIN_REVISION_DEPTH = 0.25;
const MIN_EVALUATION_WORDS = 25;
const MIN_REFLECTION_WORDS = 40;

// Words that show the student is pointing at a weakness in the AI's answer.
const CRITIQUE =
  /\b(kurang|belum|salah|keliru|tidak (tepat|lengkap|sesuai|akurat|benar|jelas|relevan)|seharusnya|padahal|lemah|bias|melewatkan|terlalu|tidak menyebut|mengabaikan|kelemahan|kekurangan)\b/i;
// Words that tie a reflection to something concrete in the student's own work.
const SPECIFIC =
  /\b(karena|misalnya|contohnya|contoh|awalnya|sekarang|ternyata|sebelumnya|setelah|tahap|draf|revisi|bagian)\b/i;

// A marked Pos 3 quotes the tutor and names a mark ("kurang" is one): the app wrote those, not the
// student, so a click earns nothing. Written by the app's composeEvaluation (evaluation-marks.ts).
export function evaluationProse(text: string) {
  return text.replace(/^> .*$/gm, "").replace(/^Penilaianku \([^)]*\):/gm, "");
}

export function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

// 1 - LCS/longer over words: 0 when the texts are the same, 1 when nothing is kept.
export function revisionDepth(before: string, after: string, limit = 1500) {
  const a = words(before).slice(0, limit);
  const b = words(after).slice(0, limit);
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 0;
  let previous = new Uint16Array(b.length + 1);
  let current = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    }
    [previous, current] = [current, previous];
  }
  return Math.round((1 - previous[b.length]! / longer) * 100) / 100;
}

const pastedShare = (counts: WritingCounts) =>
  counts.finalChars > 0 ? counts.pastedChars / counts.finalChars : 0;

export function evaluateProcessPoints(input: PointInputs): PointAward[] {
  const done = new Set(input.completedStages);
  const awards: PointAward[] = [];
  const award = (kind: ProcessPointKind, stage: Stage) =>
    awards.push({ kind, stage, points: POINTS[kind] });

  const draft = input.texts["1_independent_effort"] ?? "";
  const draftWriting = input.writing["1_independent_effort"];
  // Without a writing signal there is no evidence of how the draft came about.
  if (
    done.has("1_independent_effort") &&
    draftWriting &&
    draft.length >= MIN_DRAFT_CHARS &&
    pastedShare(draftWriting) < MAX_PASTED_SHARE_DRAFT
  ) {
    award("independent_draft", "1_independent_effort");
  }

  if (done.has("2_guided_questioning")) {
    if (input.intents.includes("explanation_hint")) award("hint_request", "2_guided_questioning");
    if (input.intents.includes("reflective_evaluative")) award("reflective_question", "2_guided_questioning");
  }

  const evaluation = evaluationProse(input.texts["3_ai_evaluation"] ?? "");
  if (
    done.has("3_ai_evaluation") &&
    words(evaluation).length >= MIN_EVALUATION_WORDS &&
    CRITIQUE.test(evaluation)
  ) {
    award("critical_evaluation", "3_ai_evaluation");
  }

  const revision = input.texts["4_revision_finalization"] ?? "";
  const revisionWriting = input.writing["4_revision_finalization"];
  if (
    done.has("4_revision_finalization") &&
    draft &&
    revisionDepth(draft, revision) >= MIN_REVISION_DEPTH &&
    (!revisionWriting || pastedShare(revisionWriting) < MAX_PASTED_SHARE_REVISION)
  ) {
    award("substantial_revision", "4_revision_finalization");
  }

  const reflection = input.texts["5_reflection"] ?? "";
  if (
    done.has("5_reflection") &&
    words(reflection).length >= MIN_REFLECTION_WORDS &&
    SPECIFIC.test(reflection)
  ) {
    award("specific_reflection", "5_reflection");
  }

  if (done.has("5_reflection") && done.size === 5) award("journey_complete", "5_reflection");

  return awards;
}

// Badges are milestones of the same ledger, never of the Index.
export const BADGES = [
  { id: "penjelajah", kind: "journey_complete", count: 1 },
  { id: "penjelas", kind: "critical_evaluation", count: 3 },
  { id: "tekun", kind: "substantial_revision", count: 3 },
] as const satisfies ReadonlyArray<{ id: string; kind: ProcessPointKind; count: number }>;

// `comebacks` counts finished assignments that earned a kind of point the one
// before them missed (see progression.ts); it backs the "Bangkit" badge.
export function badgesFrom(counts: Partial<Record<ProcessPointKind, number>>, comebacks = 0) {
  return [
    ...BADGES.map((badge) => ({
      id: badge.id,
      progress: Math.min(badge.count, counts[badge.kind] ?? 0),
      target: badge.count,
      earned: (counts[badge.kind] ?? 0) >= badge.count,
    })),
    { id: "bangkit" as const, progress: Math.min(1, comebacks), target: 1, earned: comebacks >= 1 },
  ];
}

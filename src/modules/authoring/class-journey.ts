import { revisionDepth, words } from "../gamification/process-points.rules";

// How one student went through a task, read from what they did and not from the Index: the draft,
// what they asked the tutor, and what they did with it. Teachers can check every step of this
// against the student's work, which is why these are plain counts and fixed lines.

export const JOURNEY_RULES = {
  /** A draft this long, mostly typed, is an attempt at the task and not a placeholder. */
  strongDraftWords: 40,
  maxPastedDraft: 0.4,
  /** The same line as Poin Nalar's substantial revision. */
  deepRevision: 0.25,
  pastedRevision: 0.5,
};

type Counts = { direct: number; hint: number; reflective: number };
type Writing = { pastedChars: number; finalChars: number } | undefined;

const share = (writing: Writing) => (writing && writing.finalChars > 0 ? Math.min(1, writing.pastedChars / writing.finalChars) : 0);

// Ties go to the behaviour a teacher most needs to see.
function askedBy({ direct, hint, reflective }: Counts) {
  if (direct + hint + reflective === 0) return "none" as const;
  if (direct >= hint && direct >= reflective) return "answers" as const;
  return reflective >= hint ? ("probing" as const) : ("hints" as const);
}

export function journeyOf(input: { draft: string; revision: string; draftWriting: Writing; revisionWriting: Writing; prompts: Counts }) {
  const draftWords = words(input.draft).length;
  const pasted = share(input.revisionWriting);
  const depth = revisionDepth(input.draft, input.revision);
  return {
    draftWords,
    draft: draftWords >= JOURNEY_RULES.strongDraftWords && share(input.draftWriting) < JOURNEY_RULES.maxPastedDraft ? ("strong" as const) : ("thin" as const),
    asked: askedBy(input.prompts),
    prompts: input.prompts,
    revision: pasted >= JOURNEY_RULES.pastedRevision ? ("pasted" as const) : depth >= JOURNEY_RULES.deepRevision ? ("deep" as const) : ("light" as const),
    // What changed by the student's own hand, as a share of the answer.
    ownChange: Math.round(depth * (1 - pasted) * 100),
    pastedPercent: Math.round(pasted * 100),
  };
}

// The single definition of "a quiz that can be taken". The student side
// (start / submit) and the teacher side (publish gate, editor warnings) both
// call this, so a quiz can never be published in a state students cannot take.
export type QuizDefinitionRow = {
  questionId: string;
  questionType: "multiple_choice" | "short_answer";
  acceptedAnswers: string[] | null;
  points: string;
  optionId: string | null;
  isCorrect: boolean | null;
};

export type QuizProblem = { questionId: string; message: string };

export function describeQuizProblems(rows: QuizDefinitionRow[]) {
  const questions = new Map<string, QuizDefinitionRow[]>();
  for (const row of rows) {
    const questionRows = questions.get(row.questionId) ?? [];
    questionRows.push(row);
    questions.set(row.questionId, questionRows);
  }

  const problems: QuizProblem[] = [];
  for (const [questionId, questionRows] of questions) {
    const question = questionRows[0];
    if (!question) continue;
    if (question.questionType === "multiple_choice") {
      if (questionRows.filter((row) => row.optionId).length < 2) {
        problems.push({ questionId, message: "Pilihan ganda butuh minimal 2 opsi." });
      }
      if (questionRows.filter((row) => row.isCorrect).length !== 1) {
        problems.push({
          questionId,
          message: "Pilihan ganda harus punya tepat 1 jawaban benar.",
        });
      }
    } else if ((question.acceptedAnswers?.length ?? 0) === 0) {
      problems.push({ questionId, message: "Isian singkat butuh minimal 1 jawaban diterima." });
    }
  }

  return { questionCount: questions.size, problems };
}

export function quizDefinitionsAreReady(rows: QuizDefinitionRow[]) {
  const { questionCount, problems } = describeQuizProblems(rows);
  return questionCount > 0 && problems.length === 0;
}

// How a typed short answer is compared with the accepted answers. The grader
// and the question editor (duplicate detection) must agree on this.
export function normalizeShortAnswer(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("id-ID");
}

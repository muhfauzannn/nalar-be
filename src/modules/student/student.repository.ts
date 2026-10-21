import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { publicResource } from "../../lib/pdf-upload";
import {
  assignment,
  course,
  courseAnnouncement,
  courseMembership,
  learningModule,
  learningResource,
  lesson,
  lessonProgress,
  quiz,
  quizAnswer,
  quizAttempt,
  quizOption,
  quizQuestion,
  rubricCriterion,
  stageArtifact,
  stageProgress,
  studentProfile,
  subject,
  submission,
  submissionAssessment,
  user,
} from "../../database/schema";

export const workflowStages = [
  "1_independent_effort",
  "2_guided_questioning",
  "3_ai_evaluation",
  "4_revision_finalization",
  "5_reflection",
] as const;

export type WorkflowStage = (typeof workflowStages)[number];

export type QuizAnswerInput = {
  questionId: string;
  selectedOptionId?: string;
  textAnswer?: string;
};

export async function findStudentProfile(userId: string) {
  const [profile] = await db
    .select({ gradeLevel: studentProfile.gradeLevel })
    .from(studentProfile)
    .where(eq(studentProfile.userId, userId))
    .limit(1);

  return profile ?? null;
}

export async function listStudentCourseRows(userId: string) {
  return db
    .select({
      id: course.id,
      enrollmentId: courseMembership.id,
      name: course.name,
      description: course.description,
      status: course.status,
      subjectName: subject.name,
      subjectCode: subject.code,
    })
    .from(courseMembership)
    .innerJoin(course, eq(course.id, courseMembership.courseId))
    .innerJoin(subject, eq(subject.id, course.subjectId))
    .where(
      and(
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .orderBy(asc(subject.name), asc(course.name));
}

export async function getCourseProgress(courseId: string, enrollmentId: string) {
  const [[lessonCount], [assignmentCount], [quizCount]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(distinct ${lesson.id})::int`,
        completed: sql<number>`count(distinct case when ${lessonProgress.status} = 'completed' then ${lesson.id} end)::int`,
      })
      .from(learningModule)
      .innerJoin(
        lesson,
        and(eq(lesson.moduleId, learningModule.id), eq(lesson.status, "published")),
      )
      .leftJoin(
        lessonProgress,
        and(
          eq(lessonProgress.lessonId, lesson.id),
          eq(lessonProgress.studentCourseMembershipId, enrollmentId),
        ),
      )
      .where(
        and(eq(learningModule.courseId, courseId), eq(learningModule.status, "published")),
      ),
    db
      .select({
        total: sql<number>`count(distinct ${assignment.id})::int`,
        completed: sql<number>`count(distinct case when ${submission.status} in ('submitted', 'returned') then ${assignment.id} end)::int`,
      })
      .from(assignment)
      .leftJoin(
        submission,
        and(
          eq(submission.assignmentId, assignment.id),
          eq(submission.studentCourseMembershipId, enrollmentId),
        ),
      )
      .where(
        and(
          eq(assignment.courseId, courseId),
          inArray(assignment.status, ["published", "closed"]),
        ),
      ),
    db
      .select({
        total: sql<number>`count(distinct ${quiz.id})::int`,
        completed: sql<number>`count(distinct case when ${quizAttempt.status} = 'submitted' then ${quiz.id} end)::int`,
      })
      .from(quiz)
      .leftJoin(
        quizAttempt,
        and(
          eq(quizAttempt.quizId, quiz.id),
          eq(quizAttempt.studentCourseMembershipId, enrollmentId),
        ),
      )
      .where(and(eq(quiz.courseId, courseId), inArray(quiz.status, ["published", "closed"]))),
  ]);

  const lessons = lessonCount ?? { total: 0, completed: 0 };
  const assignments = assignmentCount ?? { total: 0, completed: 0 };
  const quizzes = quizCount ?? { total: 0, completed: 0 };
  const total = lessons.total + assignments.total + quizzes.total;
  const completed =
    lessons.completed + assignments.completed + quizzes.completed;

  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    lessons,
    assignments,
    quizzes,
  };
}

export async function findStudentCourse(
  courseId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      id: course.id,
      enrollmentId: courseMembership.id,
      name: course.name,
      description: course.description,
      status: course.status,
      subjectName: subject.name,
      subjectCode: subject.code,
    })
    .from(courseMembership)
    .innerJoin(course, eq(course.id, courseMembership.courseId))
    .innerJoin(subject, eq(subject.id, course.subjectId))
    .where(
      and(
        eq(course.id, courseId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listCourseContent(courseId: string, enrollmentId: string) {
  const [lessonRows, assignmentRows, quizRows, announcements, teachers] =
    await Promise.all([
      db
        .select({
          moduleId: learningModule.id,
          moduleTitle: learningModule.title,
          moduleDescription: learningModule.description,
          modulePosition: learningModule.position,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lessonPosition: lesson.position,
          progressStatus: lessonProgress.status,
        })
        .from(learningModule)
        .leftJoin(
          lesson,
          and(eq(lesson.moduleId, learningModule.id), eq(lesson.status, "published")),
        )
        .leftJoin(
          lessonProgress,
          and(
            eq(lessonProgress.lessonId, lesson.id),
            eq(lessonProgress.studentCourseMembershipId, enrollmentId),
          ),
        )
        .where(
          and(eq(learningModule.courseId, courseId), eq(learningModule.status, "published")),
        )
        .orderBy(asc(learningModule.position), asc(lesson.position)),
      db
        .select({
          id: assignment.id,
          moduleId: assignment.moduleId,
          title: assignment.title,
          dueAt: assignment.dueAt,
          closesAt: assignment.closesAt,
          status: assignment.status,
          submissionStatus: submission.status,
          currentStage: submission.currentStage,
        })
        .from(assignment)
        .leftJoin(
          submission,
          and(
            eq(submission.assignmentId, assignment.id),
            eq(submission.studentCourseMembershipId, enrollmentId),
          ),
        )
        .where(
          and(
            eq(assignment.courseId, courseId),
            inArray(assignment.status, ["published", "closed"]),
          ),
        )
        .orderBy(asc(assignment.dueAt), asc(assignment.title)),
      db
        .select({
          id: quiz.id,
          moduleId: quiz.moduleId,
          title: quiz.title,
          dueAt: quiz.dueAt,
          closesAt: quiz.closesAt,
          status: quiz.status,
          timeLimitMinutes: quiz.timeLimitMinutes,
          attemptStatus: quizAttempt.status,
          attemptStartedAt: quizAttempt.startedAt,
          score: quizAttempt.score,
        })
        .from(quiz)
        .leftJoin(
          quizAttempt,
          and(
            eq(quizAttempt.quizId, quiz.id),
            eq(quizAttempt.studentCourseMembershipId, enrollmentId),
          ),
        )
        .where(and(eq(quiz.courseId, courseId), inArray(quiz.status, ["published", "closed"])))
        .orderBy(asc(quiz.dueAt), asc(quiz.title)),
      db
        .select({
          id: courseAnnouncement.id,
          title: courseAnnouncement.title,
          body: courseAnnouncement.body,
          publishedAt: courseAnnouncement.publishedAt,
        })
        .from(courseAnnouncement)
        .where(
          and(
            eq(courseAnnouncement.courseId, courseId),
            eq(courseAnnouncement.status, "published"),
          ),
        )
        .orderBy(desc(courseAnnouncement.publishedAt)),
      db
        .select({ name: user.name })
        .from(courseMembership)
        .innerJoin(user, eq(user.id, courseMembership.userId))
        .where(
          and(
            eq(courseMembership.courseId, courseId),
            eq(courseMembership.role, "teacher"),
            eq(courseMembership.status, "active"),
          ),
        )
        .orderBy(asc(user.name)),
    ]);

  return { lessonRows, assignmentRows, quizRows, announcements, teachers };
}

export async function findStudentLesson(
  lessonId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      position: lesson.position,
      moduleTitle: learningModule.title,
      courseId: course.id,
      courseName: course.name,
      enrollmentId: courseMembership.id,
      enrollmentStatus: courseMembership.status,
      progressStatus: lessonProgress.status,
    })
    .from(lesson)
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(course, eq(course.id, learningModule.courseId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.courseId, course.id),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    )
    .leftJoin(
      lessonProgress,
      and(
        eq(lessonProgress.lessonId, lesson.id),
        eq(lessonProgress.studentCourseMembershipId, courseMembership.id),
      ),
    )
    .where(
      and(
        eq(lesson.id, lessonId),
        eq(lesson.status, "published"),
        eq(learningModule.status, "published"),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .limit(1);

  if (!row) return null;

  const resources = (
    await db
      .select({
        id: learningResource.id,
        type: learningResource.type,
        title: learningResource.title,
        content: learningResource.content,
        url: learningResource.url,
        fileName: learningResource.fileName,
        fileSize: learningResource.fileSize,
        position: learningResource.position,
      })
      .from(learningResource)
      .where(eq(learningResource.lessonId, lessonId))
      .orderBy(asc(learningResource.position))
  ).map(publicResource);

  return { ...row, resources };
}

// Same rule as reading the lesson itself: an active or completed student of the
// course, and the lesson, its module and the course are all visible to students.
export async function findStudentResourceFile(resourceId: string, userId: string) {
  const [row] = await db
    .select({
      key: learningResource.fileKey,
      name: learningResource.fileName,
      size: learningResource.fileSize,
    })
    .from(learningResource)
    .innerJoin(lesson, eq(lesson.id, learningResource.lessonId))
    .innerJoin(learningModule, eq(learningModule.id, lesson.moduleId))
    .innerJoin(course, eq(course.id, learningModule.courseId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.courseId, course.id),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    )
    .where(
      and(
        eq(learningResource.id, resourceId),
        eq(lesson.status, "published"),
        eq(learningModule.status, "published"),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .limit(1);
  return row?.key && row.name && row.size ? { key: row.key, name: row.name, size: row.size } : null;
}

export async function updateLessonProgress(
  lessonId: string,
  enrollmentId: string,
  status: "in_progress" | "completed",
) {
  const now = new Date();
  const [row] = await db
    .insert(lessonProgress)
    .values({
      lessonId,
      studentCourseMembershipId: enrollmentId,
      status,
      startedAt: now,
      completedAt: status === "completed" ? now : null,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.lessonId, lessonProgress.studentCourseMembershipId],
      set: {
        status,
        // A raw Date inside sql`` is not serialised by postgres.js (ERR_INVALID_ARG_TYPE
        // -> HTTP 500), so pass it as an ISO string with an explicit type.
        startedAt: sql`coalesce(${lessonProgress.startedAt}, ${now.toISOString()}::timestamptz)`,
        completedAt: status === "completed" ? now : null,
        updatedAt: now,
      },
    })
    .returning({ status: lessonProgress.status });

  return row;
}

export async function findStudentAssignment(
  assignmentId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      status: assignment.status,
      availableAt: assignment.availableAt,
      dueAt: assignment.dueAt,
      closesAt: assignment.closesAt,
      rubricId: assignment.rubricId,
      courseId: course.id,
      courseName: course.name,
      enrollmentId: courseMembership.id,
      enrollmentStatus: courseMembership.status,
    })
    .from(assignment)
    .innerJoin(course, eq(course.id, assignment.courseId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.courseId, course.id),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    )
    .where(
      and(
        eq(assignment.id, assignmentId),
        inArray(assignment.status, ["published", "closed"]),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [criteria, [submissionRow]] = await Promise.all([
    db
      .select({
        id: rubricCriterion.id,
        label: rubricCriterion.label,
        description: rubricCriterion.description,
        maxPoints: rubricCriterion.maxPoints,
        position: rubricCriterion.position,
      })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.rubricId, row.rubricId))
      .orderBy(asc(rubricCriterion.position)),
    db
      .select()
      .from(submission)
      .where(
        and(
          eq(submission.assignmentId, assignmentId),
          eq(submission.studentCourseMembershipId, row.enrollmentId),
          eq(submission.attemptNumber, 1),
        ),
      )
      .limit(1),
  ]);

  if (!submissionRow) return { ...row, criteria, submission: null };

  const [stages, artifacts, [assessment]] = await Promise.all([
    db
      .select({ stage: stageProgress.stage, status: stageProgress.status })
      .from(stageProgress)
      .where(eq(stageProgress.submissionId, submissionRow.id))
      .orderBy(
        sql`case ${stageProgress.stage}
          when '1_independent_effort' then 1
          when '2_guided_questioning' then 2
          when '3_ai_evaluation' then 3
          when '4_revision_finalization' then 4
          when '5_reflection' then 5 end`,
      ),
    db
      .select({
        stage: stageArtifact.stage,
        content: stageArtifact.content,
        version: stageArtifact.version,
      })
      .from(stageArtifact)
      .where(
        and(eq(stageArtifact.submissionId, submissionRow.id), eq(stageArtifact.isFinal, true)),
      )
      .orderBy(
        sql`case ${stageArtifact.stage}
          when '1_independent_effort' then 1
          when '2_guided_questioning' then 2
          when '3_ai_evaluation' then 3
          when '4_revision_finalization' then 4
          when '5_reflection' then 5 end`,
      ),
    db
      .select({ score: submissionAssessment.score, feedback: submissionAssessment.feedback })
      .from(submissionAssessment)
      .where(eq(submissionAssessment.submissionId, submissionRow.id))
      .limit(1),
  ]);

  return {
    ...row,
    criteria,
    submission: { ...submissionRow, stages, artifacts, assessment: assessment ?? null },
  };
}

export async function createStudentSubmission(
  assignmentId: string,
  enrollmentId: string,
) {
  return db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(submission)
      .values({
        assignmentId,
        studentCourseMembershipId: enrollmentId,
        attemptNumber: 1,
        status: "in_progress",
        currentStage: workflowStages[0],
        startedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      await transaction.insert(stageProgress).values(
        workflowStages.map((stage, index) => ({
          submissionId: created.id,
          stage,
          status: index === 0 ? ("in_progress" as const) : ("locked" as const),
          startedAt: index === 0 ? new Date() : null,
        })),
      );
      return created;
    }

    const [existing] = await transaction
      .select()
      .from(submission)
      .where(
        and(
          eq(submission.assignmentId, assignmentId),
          eq(submission.studentCourseMembershipId, enrollmentId),
          eq(submission.attemptNumber, 1),
        ),
      )
      .limit(1);
    return existing;
  });
}

export async function persistStageCompletion(input: {
  submissionId: string;
  stage: WorkflowStage;
  nextStage: WorkflowStage | null;
  content?: string;
}) {
  return db.transaction(async (transaction) => {
    const now = new Date();

    const [lockedSubmission] = await transaction
      .select({
        status: submission.status,
        currentStage: submission.currentStage,
      })
      .from(submission)
      .where(eq(submission.id, input.submissionId))
      .for("update");

    if (
      !lockedSubmission ||
      lockedSubmission.status !== "in_progress" ||
      lockedSubmission.currentStage !== input.stage
    ) {
      return {
        applied: false as const,
        status: lockedSubmission?.status ?? null,
        currentStage: lockedSubmission?.currentStage ?? null,
      };
    }

    if (input.content !== undefined) {
      const [latest] = await transaction
        .select({ version: stageArtifact.version })
        .from(stageArtifact)
        .where(
          and(
            eq(stageArtifact.submissionId, input.submissionId),
            eq(stageArtifact.stage, input.stage),
          ),
        )
        .orderBy(desc(stageArtifact.version))
        .limit(1);

      await transaction
        .update(stageArtifact)
        .set({ isFinal: false, updatedAt: now })
        .where(
          and(
            eq(stageArtifact.submissionId, input.submissionId),
            eq(stageArtifact.stage, input.stage),
            eq(stageArtifact.isFinal, true),
          ),
        );

      await transaction.insert(stageArtifact).values({
        submissionId: input.submissionId,
        stage: input.stage,
        content: input.content,
        version: (latest?.version ?? 0) + 1,
        isFinal: true,
      });
    }

    const [completedStage] = await transaction
      .update(stageProgress)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(
        and(
          eq(stageProgress.submissionId, input.submissionId),
          eq(stageProgress.stage, input.stage),
          eq(stageProgress.status, "in_progress"),
        ),
      )
      .returning({ id: stageProgress.id });

    if (!completedStage) {
      throw new Error("Progres tahap assignment tidak konsisten.");
    }

    if (input.nextStage) {
      await transaction
        .update(stageProgress)
        .set({ status: "in_progress", startedAt: now, updatedAt: now })
        .where(
          and(
            eq(stageProgress.submissionId, input.submissionId),
            eq(stageProgress.stage, input.nextStage),
            eq(stageProgress.status, "locked"),
          ),
        );

      await transaction
        .update(submission)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(submission.id, input.submissionId));
    } else {
      await transaction
        .update(submission)
        .set({ status: "submitted", submittedAt: now, updatedAt: now })
        .where(eq(submission.id, input.submissionId));
    }

    return {
      applied: true as const,
      status: input.nextStage ? ("in_progress" as const) : ("submitted" as const),
      currentStage: input.nextStage,
    };
  });
}

export async function findSubmissionAccess(
  submissionId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      id: submission.id,
      status: submission.status,
      currentStage: submission.currentStage,
      assignmentStatus: assignment.status,
      closesAt: assignment.closesAt,
    })
    .from(submission)
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.id, submission.studentCourseMembershipId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        eq(courseMembership.status, "active"),
      ),
    )
    .where(eq(submission.id, submissionId))
    .limit(1);

  return row ?? null;
}

export async function findStudentQuiz(quizId: string, userId: string) {
  const [row] = await db
    .select({
      id: quiz.id,
      title: quiz.title,
      instructions: quiz.instructions,
      status: quiz.status,
      availableAt: quiz.availableAt,
      dueAt: quiz.dueAt,
      closesAt: quiz.closesAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      courseId: course.id,
      courseName: course.name,
      courseStatus: course.status,
      enrollmentId: courseMembership.id,
      enrollmentStatus: courseMembership.status,
    })
    .from(quiz)
    .innerJoin(course, eq(course.id, quiz.courseId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.courseId, course.id),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    )
    .where(
      and(
        eq(quiz.id, quizId),
        inArray(quiz.status, ["published", "closed"]),
        inArray(course.status, ["published", "archived"]),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [questionRows, [attempt]] = await Promise.all([
    db
      .select({
        questionId: quizQuestion.id,
        questionType: quizQuestion.type,
        prompt: quizQuestion.prompt,
        explanation: quizQuestion.explanation,
        acceptedAnswers: quizQuestion.acceptedAnswers,
        points: quizQuestion.points,
        questionPosition: quizQuestion.position,
        optionId: quizOption.id,
        optionLabel: quizOption.label,
        optionPosition: quizOption.position,
        optionIsCorrect: quizOption.isCorrect,
      })
      .from(quizQuestion)
      .leftJoin(quizOption, eq(quizOption.questionId, quizQuestion.id))
      .where(eq(quizQuestion.quizId, quizId))
      .orderBy(asc(quizQuestion.position), asc(quizOption.position)),
    db
      .select()
      .from(quizAttempt)
      .where(
        and(
          eq(quizAttempt.quizId, quizId),
          eq(quizAttempt.studentCourseMembershipId, row.enrollmentId),
          eq(quizAttempt.attemptNumber, 1),
        ),
      )
      .limit(1),
  ]);

  const answers = attempt
    ? await db
        .select({
          questionId: quizAnswer.questionId,
          selectedOptionId: quizAnswer.selectedOptionId,
          textAnswer: quizAnswer.textAnswer,
          isCorrect: quizAnswer.isCorrect,
          awardedPoints: quizAnswer.awardedPoints,
        })
        .from(quizAnswer)
        .where(eq(quizAnswer.attemptId, attempt.id))
    : [];

  return { ...row, questionRows, attempt: attempt ? { ...attempt, answers } : null };
}

export async function createQuizAttempt(quizId: string, enrollmentId: string) {
  const [created] = await db
    .insert(quizAttempt)
    .values({ quizId, studentCourseMembershipId: enrollmentId, attemptNumber: 1 })
    .onConflictDoNothing()
    .returning();

  if (created) return { attempt: created, created: true } as const;

  const [existing] = await db
    .select()
    .from(quizAttempt)
    .where(
      and(
        eq(quizAttempt.quizId, quizId),
        eq(quizAttempt.studentCourseMembershipId, enrollmentId),
        eq(quizAttempt.attemptNumber, 1),
      ),
    )
    .limit(1);
  return existing ? ({ attempt: existing, created: false } as const) : null;
}

export async function saveQuizAnswers(
  attemptId: string,
  answers: QuizAnswerInput[],
) {
  return db.transaction(async (transaction) => {
    const [activeAttempt] = await transaction
      .select({ id: quizAttempt.id })
      .from(quizAttempt)
      .where(
        and(
          eq(quizAttempt.id, attemptId),
          eq(quizAttempt.status, "in_progress"),
        ),
      )
      .for("update")
      .limit(1);

    if (!activeAttempt) return false;

    for (const answer of answers) {
      await transaction
        .insert(quizAnswer)
        .values({
          attemptId,
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId ?? null,
          textAnswer: answer.textAnswer ?? null,
        })
        .onConflictDoUpdate({
          target: [quizAnswer.attemptId, quizAnswer.questionId],
          set: {
            selectedOptionId: answer.selectedOptionId ?? null,
            textAnswer: answer.textAnswer ?? null,
            isCorrect: null,
            awardedPoints: null,
            updatedAt: new Date(),
          },
        });
    }

    return true;
  });
}

export async function deleteQuizAnswer(
  attemptId: string,
  questionId: string,
) {
  return db.transaction(async (transaction) => {
    const [activeAttempt] = await transaction
      .select({ id: quizAttempt.id })
      .from(quizAttempt)
      .where(
        and(
          eq(quizAttempt.id, attemptId),
          eq(quizAttempt.status, "in_progress"),
        ),
      )
      .for("update")
      .limit(1);

    if (!activeAttempt) return false;

    await transaction
      .delete(quizAnswer)
      .where(
        and(
          eq(quizAnswer.attemptId, attemptId),
          eq(quizAnswer.questionId, questionId),
        ),
      );

    return true;
  });
}

export async function findQuizAttemptAccess(
  attemptId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      id: quizAttempt.id,
      status: quizAttempt.status,
      quizId: quizAttempt.quizId,
      quizStatus: quiz.status,
      courseStatus: course.status,
      enrollmentId: quizAttempt.studentCourseMembershipId,
      enrollmentStatus: courseMembership.status,
      closesAt: quiz.closesAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      startedAt: quizAttempt.startedAt,
    })
    .from(quizAttempt)
    .innerJoin(quiz, eq(quiz.id, quizAttempt.quizId))
    .innerJoin(course, eq(course.id, quiz.courseId))
    .innerJoin(
      courseMembership,
      and(
        eq(courseMembership.id, quizAttempt.studentCourseMembershipId),
        eq(courseMembership.userId, userId),
        eq(courseMembership.role, "student"),
        inArray(courseMembership.status, ["active", "completed"]),
      ),
    )
    .where(eq(quizAttempt.id, attemptId))
    .limit(1);

  return row ?? null;
}

export async function listQuizQuestionDefinitions(quizId: string) {
  return db
    .select({
      questionId: quizQuestion.id,
      questionType: quizQuestion.type,
      acceptedAnswers: quizQuestion.acceptedAnswers,
      points: quizQuestion.points,
      optionId: quizOption.id,
      isCorrect: quizOption.isCorrect,
    })
    .from(quizQuestion)
    .leftJoin(quizOption, eq(quizOption.questionId, quizQuestion.id))
    .where(eq(quizQuestion.quizId, quizId));
}

export async function submitQuizAttempt(
  attemptId: string,
  answers: Array<
    QuizAnswerInput & { isCorrect: boolean; awardedPoints: string }
  >,
  score: string,
) {
  return db.transaction(async (transaction) => {
    const [activeAttempt] = await transaction
      .select({ id: quizAttempt.id })
      .from(quizAttempt)
      .where(
        and(
          eq(quizAttempt.id, attemptId),
          eq(quizAttempt.status, "in_progress"),
        ),
      )
      .for("update")
      .limit(1);

    if (!activeAttempt) return null;

    const now = new Date();
    for (const answer of answers) {
      await transaction
        .insert(quizAnswer)
        .values({
          attemptId,
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId ?? null,
          textAnswer: answer.textAnswer ?? null,
          isCorrect: answer.isCorrect,
          awardedPoints: answer.awardedPoints,
        })
        .onConflictDoUpdate({
          target: [quizAnswer.attemptId, quizAnswer.questionId],
          set: {
            selectedOptionId: answer.selectedOptionId ?? null,
            textAnswer: answer.textAnswer ?? null,
            isCorrect: answer.isCorrect,
            awardedPoints: answer.awardedPoints,
            updatedAt: now,
          },
        });
    }

    const [result] = await transaction
      .update(quizAttempt)
      .set({
        status: "submitted",
        score,
        submittedAt: now,
        updatedAt: now,
      })
      .where(and(eq(quizAttempt.id, attemptId), eq(quizAttempt.status, "in_progress")))
      .returning();

    return result ?? null;
  });
}

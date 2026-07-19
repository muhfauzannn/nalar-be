import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const schoolRoleEnum = pgEnum("school_role", [
  "student",
  "teacher",
  "school_admin",
]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "pending",
  "active",
  "suspended",
  "removed",
]);
export const academicYearStatusEnum = pgEnum("academic_year_status", [
  "planned",
  "active",
  "archived",
]);
export const courseStatusEnum = pgEnum("course_status", [
  "draft",
  "published",
  "archived",
]);
export const courseRoleEnum = pgEnum("course_role", ["student", "teacher"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "invited",
  "active",
  "completed",
  "removed",
]);
export const publicationStatusEnum = pgEnum("publication_status", [
  "draft",
  "published",
  "archived",
]);
export const resourceTypeEnum = pgEnum("resource_type", ["text", "link", "file"]);
export const lessonProgressStatusEnum = pgEnum("lesson_progress_status", [
  "not_started",
  "in_progress",
  "completed",
]);
export const assignmentStatusEnum = pgEnum("assignment_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);
export const submissionStatusEnum = pgEnum("submission_status", [
  "not_started",
  "in_progress",
  "submitted",
  "returned",
]);
export const workflowStageEnum = pgEnum("workflow_stage", [
  "1_independent_effort",
  "2_guided_questioning",
  "3_ai_evaluation",
  "4_revision_finalization",
  "5_reflection",
]);
export const stageStatusEnum = pgEnum("stage_status", [
  "locked",
  "in_progress",
  "completed",
]);
export const quizStatusEnum = pgEnum("quiz_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);
export const quizAttemptStatusEnum = pgEnum("quiz_attempt_status", [
  "in_progress",
  "submitted",
]);
export const quizQuestionTypeEnum = pgEnum("quiz_question_type", [
  "multiple_choice",
  "short_answer",
]);
export const tutorModeEnum = pgEnum("tutor_mode", ["hint", "feedback"]);
export const tutorMessageAuthorEnum = pgEnum("tutor_message_author", [
  "student",
  "tutor",
  "system",
]);
export const promptIntentEnum = pgEnum("prompt_intent", [
  "direct_answer",
  "explanation_hint",
  "reflective_evaluative",
]);

export const school = pgTable("school", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const schoolMembership = pgTable(
  "school_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => school.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    status: membershipStatusEnum("status").default("pending").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("school_membership_school_user_unique").on(table.schoolId, table.userId),
    index("school_membership_user_status_idx").on(table.userId, table.status),
    index("school_membership_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const schoolMemberRole = pgTable(
  "school_member_role",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => schoolMembership.id),
    role: schoolRoleEnum("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.role] })],
);

export const studentProfile = pgTable(
  "student_profile",
  {
    membershipId: uuid("membership_id")
      .primaryKey()
      .references(() => schoolMembership.id),
    gradeLevel: smallint("grade_level").notNull(),
    ...timestamps,
  },
  (table) => [
    check("student_profile_grade_level_check", sql`${table.gradeLevel} between 10 and 12`),
  ],
);

export const academicYear = pgTable(
  "academic_year",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => school.id),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: academicYearStatusEnum("status").default("planned").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("academic_year_school_name_unique").on(table.schoolId, table.name),
    check("academic_year_date_order_check", sql`${table.endsOn} > ${table.startsOn}`),
    uniqueIndex("academic_year_one_active_per_school")
      .on(table.schoolId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const academicTerm = pgTable(
  "academic_term",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYear.id),
    name: text("name").notNull(),
    position: smallint("position").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("academic_term_year_position_unique").on(table.academicYearId, table.position),
    check("academic_term_position_check", sql`${table.position} > 0`),
    check("academic_term_date_order_check", sql`${table.endsOn} > ${table.startsOn}`),
  ],
);

export const subject = pgTable(
  "subject",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").references(() => school.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subject_global_code_unique")
      .on(table.code)
      .where(sql`${table.schoolId} is null`),
    uniqueIndex("subject_school_code_unique")
      .on(table.schoolId, table.code)
      .where(sql`${table.schoolId} is not null`),
  ],
);

export const course = pgTable(
  "course",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => school.id),
    termId: uuid("term_id")
      .notNull()
      .references(() => academicTerm.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subject.id),
    name: text("name").notNull(),
    description: text("description"),
    status: courseStatusEnum("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [
    index("course_school_status_idx").on(table.schoolId, table.status),
    index("course_term_subject_idx").on(table.termId, table.subjectId),
  ],
);

export const courseMembership = pgTable(
  "course_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id),
    schoolMembershipId: uuid("school_membership_id")
      .notNull()
      .references(() => schoolMembership.id),
    role: courseRoleEnum("role").notNull(),
    status: enrollmentStatusEnum("status").default("invited").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("course_membership_course_member_role_unique").on(
      table.courseId,
      table.schoolMembershipId,
      table.role,
    ),
    index("course_membership_course_role_status_idx").on(
      table.courseId,
      table.role,
      table.status,
    ),
    index("course_membership_member_status_idx").on(
      table.schoolMembershipId,
      table.status,
    ),
  ],
);

export const learningModule = pgTable(
  "learning_module",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    status: publicationStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("learning_module_course_position_unique").on(table.courseId, table.position),
    check("learning_module_position_check", sql`${table.position} > 0`),
  ],
);

export const lesson = pgTable(
  "lesson",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => learningModule.id),
    title: text("title").notNull(),
    content: text("content"),
    position: integer("position").notNull(),
    status: publicationStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("lesson_module_position_unique").on(table.moduleId, table.position),
    check("lesson_position_check", sql`${table.position} > 0`),
  ],
);

export const learningResource = pgTable(
  "learning_resource",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lesson.id),
    type: resourceTypeEnum("type").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    url: text("url"),
    position: integer("position").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("learning_resource_lesson_position_unique").on(table.lessonId, table.position),
    check("learning_resource_position_check", sql`${table.position} > 0`),
    check(
      "learning_resource_payload_check",
      sql`(${table.type} = 'text' and ${table.content} is not null and ${table.url} is null)
        or (${table.type} in ('link', 'file') and ${table.url} is not null)`,
    ),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lesson.id),
    studentCourseMembershipId: uuid("student_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    status: lessonProgressStatusEnum("status").default("not_started").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("lesson_progress_lesson_student_unique").on(
      table.lessonId,
      table.studentCourseMembershipId,
    ),
  ],
);

export const courseAnnouncement = pgTable(
  "course_announcement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id),
    authorCourseMembershipId: uuid("author_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: publicationStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("course_announcement_course_status_idx").on(table.courseId, table.status)],
);

export const rubric = pgTable(
  "rubric",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").references(() => school.id),
    sourceRubricId: uuid("source_rubric_id"),
    name: text("name").notNull(),
    isTemplate: boolean("is_template").default(true).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.sourceRubricId],
      foreignColumns: [table.id],
      name: "rubric_source_rubric_id_fk",
    }),
  ],
);

export const rubricCriterion = pgTable(
  "rubric_criterion",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubric.id),
    label: text("label").notNull(),
    description: text("description").notNull(),
    maxPoints: numeric("max_points", { precision: 6, scale: 2 }).notNull(),
    position: smallint("position").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("rubric_criterion_rubric_position_unique").on(table.rubricId, table.position),
    check("rubric_criterion_max_points_check", sql`${table.maxPoints} > 0`),
    check("rubric_criterion_position_check", sql`${table.position} > 0`),
  ],
);

export const scenario = pgTable("scenario", {
  id: uuid("id").defaultRandom().primaryKey(),
  schoolId: uuid("school_id").references(() => school.id),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subject.id),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  defaultRubricId: uuid("default_rubric_id")
    .notNull()
    .references(() => rubric.id),
  isBuiltin: boolean("is_builtin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
});

export const assignment = pgTable(
  "assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id),
    moduleId: uuid("module_id").references(() => learningModule.id),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => scenario.id),
    rubricId: uuid("rubric_id")
      .notNull()
      .unique()
      .references(() => rubric.id),
    createdByCourseMembershipId: uuid("created_by_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    status: assignmentStatusEnum("status").default("draft").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    maxAttempts: smallint("max_attempts").default(1).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("assignment_course_status_idx").on(table.courseId, table.status),
    index("assignment_course_due_idx").on(table.courseId, table.dueAt),
    check("assignment_max_attempts_check", sql`${table.maxAttempts} > 0`),
    check(
      "assignment_schedule_check",
      sql`(${table.availableAt} is null or ${table.dueAt} is null or ${table.availableAt} <= ${table.dueAt})
        and (${table.dueAt} is null or ${table.closesAt} is null or ${table.dueAt} <= ${table.closesAt})`,
    ),
  ],
);

export const submission = pgTable(
  "submission",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignment.id),
    studentCourseMembershipId: uuid("student_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    attemptNumber: smallint("attempt_number").default(1).notNull(),
    status: submissionStatusEnum("status").default("not_started").notNull(),
    currentStage: workflowStageEnum("current_stage")
      .default("1_independent_effort")
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("submission_assignment_student_attempt_unique").on(
      table.assignmentId,
      table.studentCourseMembershipId,
      table.attemptNumber,
    ),
    check("submission_attempt_number_check", sql`${table.attemptNumber} > 0`),
  ],
);

export const stageProgress = pgTable(
  "stage_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submission.id),
    stage: workflowStageEnum("stage").notNull(),
    status: stageStatusEnum("status").default("locked").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [unique("stage_progress_submission_stage_unique").on(table.submissionId, table.stage)],
);

export const stageArtifact = pgTable(
  "stage_artifact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submission.id),
    stage: workflowStageEnum("stage").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull(),
    isFinal: boolean("is_final").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("stage_artifact_submission_stage_version_unique").on(
      table.submissionId,
      table.stage,
      table.version,
    ),
    uniqueIndex("stage_artifact_one_final_per_stage")
      .on(table.submissionId, table.stage)
      .where(sql`${table.isFinal} = true`),
    check("stage_artifact_version_check", sql`${table.version} > 0`),
    check(
      "stage_artifact_allowed_stage_check",
      sql`${table.stage} in ('1_independent_effort', '3_ai_evaluation', '4_revision_finalization', '5_reflection')`,
    ),
  ],
);

export const submissionAssessment = pgTable(
  "submission_assessment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references(() => submission.id),
    gradedByCourseMembershipId: uuid("graded_by_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    score: numeric("score", { precision: 6, scale: 2 }).notNull(),
    feedback: text("feedback"),
    gradedAt: timestamp("graded_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check("submission_assessment_score_check", sql`${table.score} between 0 and 100`),
  ],
);

export const rubricCriterionScore = pgTable(
  "rubric_criterion_score",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => submissionAssessment.id),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => rubricCriterion.id),
    score: numeric("score", { precision: 6, scale: 2 }).notNull(),
    feedback: text("feedback"),
    ...timestamps,
  },
  (table) => [
    unique("rubric_criterion_score_assessment_criterion_unique").on(
      table.assessmentId,
      table.criterionId,
    ),
    check("rubric_criterion_score_nonnegative_check", sql`${table.score} >= 0`),
  ],
);

// Conventional objective quizzes are an explicit product extension requested for
// the student LMS dashboard. They remain separate from NALAR scenario assignments.
export const quiz = pgTable(
  "quiz",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => course.id),
    moduleId: uuid("module_id").references(() => learningModule.id),
    createdByCourseMembershipId: uuid("created_by_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    title: text("title").notNull(),
    instructions: text("instructions"),
    status: quizStatusEnum("status").default("draft").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    timeLimitMinutes: smallint("time_limit_minutes"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("quiz_course_status_idx").on(table.courseId, table.status),
    index("quiz_course_due_idx").on(table.courseId, table.dueAt),
    check(
      "quiz_time_limit_check",
      sql`${table.timeLimitMinutes} is null or ${table.timeLimitMinutes} > 0`,
    ),
    check(
      "quiz_schedule_check",
      sql`(${table.availableAt} is null or ${table.dueAt} is null or ${table.availableAt} <= ${table.dueAt})
        and (${table.dueAt} is null or ${table.closesAt} is null or ${table.dueAt} <= ${table.closesAt})`,
    ),
  ],
);

export const quizQuestion = pgTable(
  "quiz_question",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id),
    type: quizQuestionTypeEnum("type").default("multiple_choice").notNull(),
    prompt: text("prompt").notNull(),
    explanation: text("explanation"),
    acceptedAnswers: text("accepted_answers").array(),
    points: numeric("points", { precision: 6, scale: 2 }).default("1").notNull(),
    position: smallint("position").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("quiz_question_quiz_position_unique").on(table.quizId, table.position),
    check("quiz_question_points_check", sql`${table.points} > 0`),
    check("quiz_question_position_check", sql`${table.position} > 0`),
    check(
      "quiz_question_answer_key_check",
      sql`(${table.type} = 'multiple_choice' and ${table.acceptedAnswers} is null)
        or (${table.type} = 'short_answer' and coalesce(cardinality(${table.acceptedAnswers}), 0) > 0)`,
    ),
  ],
);

export const quizOption = pgTable(
  "quiz_option",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => quizQuestion.id),
    label: text("label").notNull(),
    isCorrect: boolean("is_correct").default(false).notNull(),
    position: smallint("position").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("quiz_option_question_position_unique").on(table.questionId, table.position),
    check("quiz_option_position_check", sql`${table.position} > 0`),
  ],
);

export const quizAttempt = pgTable(
  "quiz_attempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quiz.id),
    studentCourseMembershipId: uuid("student_course_membership_id")
      .notNull()
      .references(() => courseMembership.id),
    attemptNumber: smallint("attempt_number").default(1).notNull(),
    status: quizAttemptStatusEnum("status").default("in_progress").notNull(),
    score: numeric("score", { precision: 6, scale: 2 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("quiz_attempt_quiz_student_attempt_unique").on(
      table.quizId,
      table.studentCourseMembershipId,
      table.attemptNumber,
    ),
    check("quiz_attempt_number_check", sql`${table.attemptNumber} > 0`),
    check(
      "quiz_attempt_score_check",
      sql`${table.score} is null or ${table.score} between 0 and 100`,
    ),
  ],
);

export const quizAnswer = pgTable(
  "quiz_answer",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => quizAttempt.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => quizQuestion.id),
    selectedOptionId: uuid("selected_option_id")
      .references(() => quizOption.id),
    textAnswer: text("text_answer"),
    isCorrect: boolean("is_correct"),
    awardedPoints: numeric("awarded_points", { precision: 6, scale: 2 }),
    ...timestamps,
  },
  (table) => [
    unique("quiz_answer_attempt_question_unique").on(table.attemptId, table.questionId),
    check(
      "quiz_answer_value_check",
      sql`(${table.selectedOptionId} is not null and ${table.textAnswer} is null)
        or (${table.selectedOptionId} is null and nullif(btrim(${table.textAnswer}), '') is not null)`,
    ),
  ],
);

// Guarded AI tutor conversations are auditable learning records. A conversation
// belongs to exactly one assignment submission or one quiz attempt; audio itself
// is never stored, only the transcript the student can also see in the UI.
export const tutorConversation = pgTable(
  "tutor_conversation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id").references(() => submission.id),
    quizAttemptId: uuid("quiz_attempt_id").references(() => quizAttempt.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tutor_conversation_submission_unique")
      .on(table.submissionId)
      .where(sql`${table.submissionId} is not null`),
    uniqueIndex("tutor_conversation_quiz_attempt_unique")
      .on(table.quizAttemptId)
      .where(sql`${table.quizAttemptId} is not null`),
    check(
      "tutor_conversation_one_target_check",
      sql`num_nonnulls(${table.submissionId}, ${table.quizAttemptId}) = 1`,
    ),
  ],
);

export const tutorMessage = pgTable(
  "tutor_message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversation.id),
    quizQuestionId: uuid("quiz_question_id").references(() => quizQuestion.id),
    clientEventId: uuid("client_event_id").notNull(),
    author: tutorMessageAuthorEnum("author").notNull(),
    content: text("content").notNull(),
    mode: tutorModeEnum("mode"),
    wasRedirected: boolean("was_redirected").default(false).notNull(),
    modelVersion: text("model_version"),
    sequence: integer("sequence").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("tutor_message_conversation_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    unique("tutor_message_conversation_event_unique").on(
      table.conversationId,
      table.clientEventId,
    ),
    index("tutor_message_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check("tutor_message_content_check", sql`length(btrim(${table.content})) between 1 and 4000`),
    check(
      "tutor_message_metadata_check",
      sql`(${table.author} = 'student' and ${table.mode} is not null and ${table.modelVersion} is null)
        or (${table.author} = 'tutor' and ${table.mode} is not null and ${table.modelVersion} is not null)
        or (${table.author} = 'system' and ${table.mode} is null and ${table.modelVersion} is null)`,
    ),
  ],
);

export const promptClassification = pgTable(
  "prompt_classification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .unique()
      .references(() => tutorMessage.id),
    intent: promptIntentEnum("intent").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    isFallback: boolean("is_fallback").default(false).notNull(),
    classifierVersion: text("classifier_version").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "prompt_classification_confidence_check",
      sql`${table.confidence} between 0 and 1`,
    ),
  ],
);

export const offloadingLevelEnum = pgEnum("offloading_level", [
  "1_ai_as_tool",
  "2_ai_as_scaffold",
  "3_partial_offloading",
  "4_full_offloading",
]);
export const aiRelianceLevelEnum = pgEnum("ai_reliance_level", [
  "none",
  "low",
  "moderate",
  "high",
]);

// The AI Offloading Index is reflective learning-process feedback, never an
// academic grade. One result per submitted assignment, computed after Stage 5
// from the tutor prompt-intent signals and the five-stage artifacts. It must
// never feed the gradebook (see PRD §5.8 and SCHEMA §12).
export const offloadingIndexResult = pgTable(
  "offloading_index_result",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references(() => submission.id),
    level: offloadingLevelEnum("level").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    intentInput: numeric("intent_input", { precision: 5, scale: 2 }).notNull(),
    effortInput: numeric("effort_input", { precision: 5, scale: 2 }).notNull(),
    studentReport: text("student_report").notNull(),
    recommendations: text("recommendations").array().notNull(),
    scoringVersion: text("scoring_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check("offloading_index_result_score_check", sql`${table.score} between 0 and 100`),
    check(
      "offloading_index_result_intent_input_check",
      sql`${table.intentInput} between 0 and 100`,
    ),
    check(
      "offloading_index_result_effort_input_check",
      sql`${table.effortInput} between 0 and 100`,
    ),
  ],
);

export const explanationFactor = pgTable(
  "explanation_factor",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resultId: uuid("result_id")
      .notNull()
      .references(() => offloadingIndexResult.id),
    factor: text("factor").notNull(),
    contribution: numeric("contribution", { precision: 5, scale: 2 }).notNull(),
    plainExplanation: text("plain_explanation").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("explanation_factor_result_factor_unique").on(table.resultId, table.factor),
  ],
);

// Quizzes stay separate from the AI Offloading Index (PRD §5.3A). This is a
// lighter, non-judgmental reflection on how the student used the Guarded Tutor
// during the attempt. It is not an academic score and never affects the score.
export const quizUsageReflection = pgTable(
  "quiz_usage_reflection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizAttemptId: uuid("quiz_attempt_id")
      .notNull()
      .unique()
      .references(() => quizAttempt.id),
    relianceLevel: aiRelianceLevelEnum("reliance_level").notNull(),
    studentReport: text("student_report").notNull(),
    recommendations: text("recommendations").array().notNull(),
    promptTurnCount: integer("prompt_turn_count").default(0).notNull(),
    directCount: integer("direct_count").default(0).notNull(),
    hintCount: integer("hint_count").default(0).notNull(),
    reflectiveCount: integer("reflective_count").default(0).notNull(),
    redirectedCount: integer("redirected_count").default(0).notNull(),
    scoringVersion: text("scoring_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check("quiz_usage_reflection_prompt_turn_check", sql`${table.promptTurnCount} >= 0`),
    check("quiz_usage_reflection_direct_check", sql`${table.directCount} >= 0`),
    check("quiz_usage_reflection_hint_check", sql`${table.hintCount} >= 0`),
    check("quiz_usage_reflection_reflective_check", sql`${table.reflectiveCount} >= 0`),
    check("quiz_usage_reflection_redirected_check", sql`${table.redirectedCount} >= 0`),
  ],
);

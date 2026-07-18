CREATE TYPE "public"."academic_year_status" AS ENUM('planned', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('draft', 'published', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."course_role" AS ENUM('student', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('invited', 'active', 'completed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."lesson_progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending', 'active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."quiz_attempt_status" AS ENUM('in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."quiz_status" AS ENUM('draft', 'published', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('text', 'link', 'file');--> statement-breakpoint
CREATE TYPE "public"."school_role" AS ENUM('student', 'teacher', 'school_admin');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('locked', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('not_started', 'in_progress', 'submitted', 'returned');--> statement-breakpoint
CREATE TYPE "public"."workflow_stage" AS ENUM('1_independent_effort', '2_guided_questioning', '3_ai_evaluation', '4_revision_finalization', '5_reflection');--> statement-breakpoint
CREATE TABLE "academic_term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_term_year_position_unique" UNIQUE("academic_year_id","position"),
	CONSTRAINT "academic_term_position_check" CHECK ("academic_term"."position" > 0),
	CONSTRAINT "academic_term_date_order_check" CHECK ("academic_term"."ends_on" > "academic_term"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "academic_year" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "academic_year_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_year_school_name_unique" UNIQUE("school_id","name"),
	CONSTRAINT "academic_year_date_order_check" CHECK ("academic_year"."ends_on" > "academic_year"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"module_id" uuid,
	"scenario_id" uuid NOT NULL,
	"rubric_id" uuid NOT NULL,
	"created_by_course_membership_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"status" "assignment_status" DEFAULT 'draft' NOT NULL,
	"available_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"max_attempts" smallint DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_rubric_id_unique" UNIQUE("rubric_id"),
	CONSTRAINT "assignment_max_attempts_check" CHECK ("assignment"."max_attempts" > 0),
	CONSTRAINT "assignment_schedule_check" CHECK (("assignment"."available_at" is null or "assignment"."due_at" is null or "assignment"."available_at" <= "assignment"."due_at")
        and ("assignment"."due_at" is null or "assignment"."closes_at" is null or "assignment"."due_at" <= "assignment"."closes_at"))
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_announcement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"author_course_membership_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"school_membership_id" uuid NOT NULL,
	"role" "course_role" NOT NULL,
	"status" "enrollment_status" DEFAULT 'invited' NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_membership_course_member_role_unique" UNIQUE("course_id","school_membership_id","role")
);
--> statement-breakpoint
CREATE TABLE "learning_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_module_course_position_unique" UNIQUE("course_id","position"),
	CONSTRAINT "learning_module_position_check" CHECK ("learning_module"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "learning_resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"type" "resource_type" NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"url" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_resource_lesson_position_unique" UNIQUE("lesson_id","position"),
	CONSTRAINT "learning_resource_position_check" CHECK ("learning_resource"."position" > 0),
	CONSTRAINT "learning_resource_payload_check" CHECK (("learning_resource"."type" = 'text' and "learning_resource"."content" is not null and "learning_resource"."url" is null)
        or ("learning_resource"."type" in ('link', 'file') and "learning_resource"."url" is not null))
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"position" integer NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_module_position_unique" UNIQUE("module_id","position"),
	CONSTRAINT "lesson_position_check" CHECK ("lesson"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_course_membership_id" uuid NOT NULL,
	"status" "lesson_progress_status" DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_lesson_student_unique" UNIQUE("lesson_id","student_course_membership_id")
);
--> statement-breakpoint
CREATE TABLE "quiz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"module_id" uuid,
	"created_by_course_membership_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"status" "quiz_status" DEFAULT 'draft' NOT NULL,
	"available_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"time_limit_minutes" smallint,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_time_limit_check" CHECK ("quiz"."time_limit_minutes" is null or "quiz"."time_limit_minutes" > 0),
	CONSTRAINT "quiz_schedule_check" CHECK (("quiz"."available_at" is null or "quiz"."due_at" is null or "quiz"."available_at" <= "quiz"."due_at")
        and ("quiz"."due_at" is null or "quiz"."closes_at" is null or "quiz"."due_at" <= "quiz"."closes_at"))
);
--> statement-breakpoint
CREATE TABLE "quiz_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_id" uuid NOT NULL,
	"is_correct" boolean,
	"awarded_points" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_answer_attempt_question_unique" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "quiz_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"student_course_membership_id" uuid NOT NULL,
	"attempt_number" smallint DEFAULT 1 NOT NULL,
	"status" "quiz_attempt_status" DEFAULT 'in_progress' NOT NULL,
	"score" numeric(6, 2),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempt_quiz_student_attempt_unique" UNIQUE("quiz_id","student_course_membership_id","attempt_number"),
	CONSTRAINT "quiz_attempt_number_check" CHECK ("quiz_attempt"."attempt_number" > 0),
	CONSTRAINT "quiz_attempt_score_check" CHECK ("quiz_attempt"."score" is null or "quiz_attempt"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "quiz_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_option_question_position_unique" UNIQUE("question_id","position"),
	CONSTRAINT "quiz_option_position_check" CHECK ("quiz_option"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "quiz_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"explanation" text,
	"points" numeric(6, 2) DEFAULT '1' NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_question_quiz_position_unique" UNIQUE("quiz_id","position"),
	CONSTRAINT "quiz_question_points_check" CHECK ("quiz_question"."points" > 0),
	CONSTRAINT "quiz_question_position_check" CHECK ("quiz_question"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "rubric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"source_rubric_id" uuid,
	"name" text NOT NULL,
	"is_template" boolean DEFAULT true NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_criterion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"max_points" numeric(6, 2) NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubric_criterion_rubric_position_unique" UNIQUE("rubric_id","position"),
	CONSTRAINT "rubric_criterion_max_points_check" CHECK ("rubric_criterion"."max_points" > 0),
	CONSTRAINT "rubric_criterion_position_check" CHECK ("rubric_criterion"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "rubric_criterion_score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubric_criterion_score_assessment_criterion_unique" UNIQUE("assessment_id","criterion_id"),
	CONSTRAINT "rubric_criterion_score_nonnegative_check" CHECK ("rubric_criterion_score"."score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scenario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"default_rubric_id" uuid NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "school_member_role" (
	"membership_id" uuid NOT NULL,
	"role" "school_role" NOT NULL,
	CONSTRAINT "school_member_role_membership_id_role_pk" PRIMARY KEY("membership_id","role")
);
--> statement-breakpoint
CREATE TABLE "school_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_membership_school_user_unique" UNIQUE("school_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stage_artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"stage" "workflow_stage" NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_artifact_submission_stage_version_unique" UNIQUE("submission_id","stage","version"),
	CONSTRAINT "stage_artifact_version_check" CHECK ("stage_artifact"."version" > 0),
	CONSTRAINT "stage_artifact_allowed_stage_check" CHECK ("stage_artifact"."stage" in ('1_independent_effort', '3_ai_evaluation', '4_revision_finalization', '5_reflection'))
);
--> statement-breakpoint
CREATE TABLE "stage_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"stage" "workflow_stage" NOT NULL,
	"status" "stage_status" DEFAULT 'locked' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_progress_submission_stage_unique" UNIQUE("submission_id","stage")
);
--> statement-breakpoint
CREATE TABLE "student_profile" (
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"grade_level" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_profile_grade_level_check" CHECK ("student_profile"."grade_level" between 10 and 12)
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_course_membership_id" uuid NOT NULL,
	"attempt_number" smallint DEFAULT 1 NOT NULL,
	"status" "submission_status" DEFAULT 'not_started' NOT NULL,
	"current_stage" "workflow_stage" DEFAULT '1_independent_effort' NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_assignment_student_attempt_unique" UNIQUE("assignment_id","student_course_membership_id","attempt_number"),
	CONSTRAINT "submission_attempt_number_check" CHECK ("submission"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "submission_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"graded_by_course_membership_id" uuid NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"feedback" text,
	"graded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_assessment_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "submission_assessment_score_check" CHECK ("submission_assessment"."score" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "academic_term" ADD CONSTRAINT "academic_term_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_module_id_learning_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."learning_module"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_rubric_id_rubric_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_created_by_course_membership_id_course_membership_id_fk" FOREIGN KEY ("created_by_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_term_id_academic_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_announcement" ADD CONSTRAINT "course_announcement_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_announcement" ADD CONSTRAINT "course_announcement_author_course_membership_id_course_membership_id_fk" FOREIGN KEY ("author_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_school_membership_id_school_membership_id_fk" FOREIGN KEY ("school_membership_id") REFERENCES "public"."school_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_module" ADD CONSTRAINT "learning_module_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resource" ADD CONSTRAINT "learning_resource_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_module_id_learning_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."learning_module"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_student_course_membership_id_course_membership_id_fk" FOREIGN KEY ("student_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_module_id_learning_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."learning_module"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_created_by_course_membership_id_course_membership_id_fk" FOREIGN KEY ("created_by_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_attempt_id_quiz_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_question_id_quiz_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_selected_option_id_quiz_option_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."quiz_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_student_course_membership_id_course_membership_id_fk" FOREIGN KEY ("student_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_option" ADD CONSTRAINT "quiz_option_question_id_quiz_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric" ADD CONSTRAINT "rubric_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric" ADD CONSTRAINT "rubric_source_rubric_id_fk" FOREIGN KEY ("source_rubric_id") REFERENCES "public"."rubric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criterion" ADD CONSTRAINT "rubric_criterion_rubric_id_rubric_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criterion_score" ADD CONSTRAINT "rubric_criterion_score_assessment_id_submission_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."submission_assessment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criterion_score" ADD CONSTRAINT "rubric_criterion_score_criterion_id_rubric_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."rubric_criterion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_default_rubric_id_rubric_id_fk" FOREIGN KEY ("default_rubric_id") REFERENCES "public"."rubric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_member_role" ADD CONSTRAINT "school_member_role_membership_id_school_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."school_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_membership" ADD CONSTRAINT "school_membership_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_membership" ADD CONSTRAINT "school_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_artifact" ADD CONSTRAINT "stage_artifact_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_progress" ADD CONSTRAINT "stage_progress_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_membership_id_school_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."school_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_student_course_membership_id_course_membership_id_fk" FOREIGN KEY ("student_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_assessment" ADD CONSTRAINT "submission_assessment_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_assessment" ADD CONSTRAINT "submission_assessment_graded_by_course_membership_id_course_membership_id_fk" FOREIGN KEY ("graded_by_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_year_one_active_per_school" ON "academic_year" USING btree ("school_id") WHERE "academic_year"."status" = 'active';--> statement-breakpoint
CREATE INDEX "assignment_course_status_idx" ON "assignment" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "assignment_course_due_idx" ON "assignment" USING btree ("course_id","due_at");--> statement-breakpoint
CREATE INDEX "course_school_status_idx" ON "course" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "course_term_subject_idx" ON "course" USING btree ("term_id","subject_id");--> statement-breakpoint
CREATE INDEX "course_announcement_course_status_idx" ON "course_announcement" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "course_membership_course_role_status_idx" ON "course_membership" USING btree ("course_id","role","status");--> statement-breakpoint
CREATE INDEX "course_membership_member_status_idx" ON "course_membership" USING btree ("school_membership_id","status");--> statement-breakpoint
CREATE INDEX "quiz_course_status_idx" ON "quiz" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "quiz_course_due_idx" ON "quiz" USING btree ("course_id","due_at");--> statement-breakpoint
CREATE INDEX "school_membership_user_status_idx" ON "school_membership" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "school_membership_school_status_idx" ON "school_membership" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_artifact_one_final_per_stage" ON "stage_artifact" USING btree ("submission_id","stage") WHERE "stage_artifact"."is_final" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "subject_global_code_unique" ON "subject" USING btree ("code") WHERE "subject"."school_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "subject_school_code_unique" ON "subject" USING btree ("school_id","code") WHERE "subject"."school_id" is not null;
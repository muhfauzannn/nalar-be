CREATE TYPE "public"."ai_reliance_level" AS ENUM('none', 'low', 'moderate', 'high');--> statement-breakpoint
CREATE TYPE "public"."offloading_level" AS ENUM('1_ai_as_tool', '2_ai_as_scaffold', '3_partial_offloading', '4_full_offloading');--> statement-breakpoint
CREATE TABLE "explanation_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"factor" text NOT NULL,
	"contribution" numeric(5, 2) NOT NULL,
	"plain_explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "explanation_factor_result_factor_unique" UNIQUE("result_id","factor")
);
--> statement-breakpoint
CREATE TABLE "offloading_index_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"level" "offloading_level" NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"intent_input" numeric(5, 2) NOT NULL,
	"effort_input" numeric(5, 2) NOT NULL,
	"student_report" text NOT NULL,
	"recommendations" text[] NOT NULL,
	"scoring_version" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offloading_index_result_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "offloading_index_result_score_check" CHECK ("offloading_index_result"."score" between 0 and 100),
	CONSTRAINT "offloading_index_result_intent_input_check" CHECK ("offloading_index_result"."intent_input" between 0 and 100),
	CONSTRAINT "offloading_index_result_effort_input_check" CHECK ("offloading_index_result"."effort_input" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "quiz_usage_reflection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_attempt_id" uuid NOT NULL,
	"reliance_level" "ai_reliance_level" NOT NULL,
	"student_report" text NOT NULL,
	"recommendations" text[] NOT NULL,
	"prompt_turn_count" integer DEFAULT 0 NOT NULL,
	"direct_count" integer DEFAULT 0 NOT NULL,
	"hint_count" integer DEFAULT 0 NOT NULL,
	"reflective_count" integer DEFAULT 0 NOT NULL,
	"redirected_count" integer DEFAULT 0 NOT NULL,
	"scoring_version" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_usage_reflection_quiz_attempt_id_unique" UNIQUE("quiz_attempt_id"),
	CONSTRAINT "quiz_usage_reflection_prompt_turn_check" CHECK ("quiz_usage_reflection"."prompt_turn_count" >= 0),
	CONSTRAINT "quiz_usage_reflection_direct_check" CHECK ("quiz_usage_reflection"."direct_count" >= 0),
	CONSTRAINT "quiz_usage_reflection_hint_check" CHECK ("quiz_usage_reflection"."hint_count" >= 0),
	CONSTRAINT "quiz_usage_reflection_reflective_check" CHECK ("quiz_usage_reflection"."reflective_count" >= 0),
	CONSTRAINT "quiz_usage_reflection_redirected_check" CHECK ("quiz_usage_reflection"."redirected_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "explanation_factor" ADD CONSTRAINT "explanation_factor_result_id_offloading_index_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."offloading_index_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offloading_index_result" ADD CONSTRAINT "offloading_index_result_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_usage_reflection" ADD CONSTRAINT "quiz_usage_reflection_quiz_attempt_id_quiz_attempt_id_fk" FOREIGN KEY ("quiz_attempt_id") REFERENCES "public"."quiz_attempt"("id") ON DELETE no action ON UPDATE no action;
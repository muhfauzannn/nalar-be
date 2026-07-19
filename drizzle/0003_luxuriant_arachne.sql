CREATE TYPE "public"."prompt_intent" AS ENUM('direct_answer', 'explanation_hint', 'reflective_evaluative');--> statement-breakpoint
CREATE TYPE "public"."tutor_message_author" AS ENUM('student', 'tutor', 'system');--> statement-breakpoint
CREATE TYPE "public"."tutor_mode" AS ENUM('hint', 'feedback');--> statement-breakpoint
CREATE TABLE "prompt_classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"intent" "prompt_intent" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"classifier_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_classification_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "prompt_classification_confidence_check" CHECK ("prompt_classification"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "tutor_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid,
	"quiz_attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_conversation_one_target_check" CHECK (num_nonnulls("tutor_conversation"."submission_id", "tutor_conversation"."quiz_attempt_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "tutor_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"quiz_question_id" uuid,
	"client_event_id" uuid NOT NULL,
	"author" "tutor_message_author" NOT NULL,
	"content" text NOT NULL,
	"mode" "tutor_mode",
	"was_redirected" boolean DEFAULT false NOT NULL,
	"model_version" text,
	"sequence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_message_conversation_sequence_unique" UNIQUE("conversation_id","sequence"),
	CONSTRAINT "tutor_message_conversation_event_unique" UNIQUE("conversation_id","client_event_id"),
	CONSTRAINT "tutor_message_content_check" CHECK (length(btrim("tutor_message"."content")) between 1 and 4000),
	CONSTRAINT "tutor_message_metadata_check" CHECK (("tutor_message"."author" = 'student' and "tutor_message"."mode" is not null and "tutor_message"."model_version" is null)
        or ("tutor_message"."author" = 'tutor' and "tutor_message"."mode" is not null and "tutor_message"."model_version" is not null)
        or ("tutor_message"."author" = 'system' and "tutor_message"."mode" is null and "tutor_message"."model_version" is null))
);
--> statement-breakpoint
ALTER TABLE "prompt_classification" ADD CONSTRAINT "prompt_classification_message_id_tutor_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."tutor_message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversation" ADD CONSTRAINT "tutor_conversation_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversation" ADD CONSTRAINT "tutor_conversation_quiz_attempt_id_quiz_attempt_id_fk" FOREIGN KEY ("quiz_attempt_id") REFERENCES "public"."quiz_attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_message" ADD CONSTRAINT "tutor_message_conversation_id_tutor_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_message" ADD CONSTRAINT "tutor_message_quiz_question_id_quiz_question_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_conversation_submission_unique" ON "tutor_conversation" USING btree ("submission_id") WHERE "tutor_conversation"."submission_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_conversation_quiz_attempt_unique" ON "tutor_conversation" USING btree ("quiz_attempt_id") WHERE "tutor_conversation"."quiz_attempt_id" is not null;--> statement-breakpoint
CREATE INDEX "tutor_message_conversation_created_idx" ON "tutor_message" USING btree ("conversation_id","created_at");
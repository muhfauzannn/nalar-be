CREATE TYPE "public"."quiz_question_type" AS ENUM('multiple_choice', 'short_answer');--> statement-breakpoint
ALTER TABLE "quiz_answer" ALTER COLUMN "selected_option_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_answer" ADD COLUMN "text_answer" text;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD COLUMN "type" "quiz_question_type" DEFAULT 'multiple_choice' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD COLUMN "accepted_answers" text[];--> statement-breakpoint
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_value_check" CHECK (("quiz_answer"."selected_option_id" is not null and "quiz_answer"."text_answer" is null)
        or ("quiz_answer"."selected_option_id" is null and nullif(btrim("quiz_answer"."text_answer"), '') is not null));--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_answer_key_check" CHECK (("quiz_question"."type" = 'multiple_choice' and "quiz_question"."accepted_answers" is null)
        or ("quiz_question"."type" = 'short_answer' and coalesce(cardinality("quiz_question"."accepted_answers"), 0) > 0));
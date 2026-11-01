CREATE TABLE "writing_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"stage" "workflow_stage" NOT NULL,
	"active_seconds" integer NOT NULL,
	"typed_chars" integer NOT NULL,
	"deleted_chars" integer NOT NULL,
	"paste_count" integer NOT NULL,
	"pasted_chars" integer NOT NULL,
	"largest_paste" integer NOT NULL,
	"long_pauses" integer NOT NULL,
	"focus_losses" integer NOT NULL,
	"final_chars" integer NOT NULL,
	"recorder_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_signal_submission_stage_unique" UNIQUE("submission_id","stage"),
	CONSTRAINT "writing_signal_stage_check" CHECK ("writing_signal"."stage" in ('1_independent_effort', '4_revision_finalization')),
	CONSTRAINT "writing_signal_counts_check" CHECK ("writing_signal"."active_seconds" >= 0 and "writing_signal"."typed_chars" >= 0 and "writing_signal"."deleted_chars" >= 0
        and "writing_signal"."paste_count" >= 0 and "writing_signal"."pasted_chars" >= 0 and "writing_signal"."largest_paste" >= 0
        and "writing_signal"."long_pauses" >= 0 and "writing_signal"."focus_losses" >= 0 and "writing_signal"."final_chars" >= 0
        and "writing_signal"."largest_paste" <= "writing_signal"."pasted_chars")
);
--> statement-breakpoint
ALTER TABLE "writing_signal" ADD CONSTRAINT "writing_signal_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;
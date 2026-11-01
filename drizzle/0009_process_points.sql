CREATE TYPE "public"."process_point_kind" AS ENUM('independent_draft', 'hint_request', 'reflective_question', 'critical_evaluation', 'substantial_revision', 'specific_reflection', 'journey_complete');--> statement-breakpoint
CREATE TABLE "process_point_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"student_course_membership_id" uuid NOT NULL,
	"kind" "process_point_kind" NOT NULL,
	"stage" "workflow_stage" NOT NULL,
	"points" smallint NOT NULL,
	"rule_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_point_event_submission_kind_unique" UNIQUE("submission_id","kind"),
	CONSTRAINT "process_point_event_points_check" CHECK ("process_point_event"."points" between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "process_point_event" ADD CONSTRAINT "process_point_event_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_point_event" ADD CONSTRAINT "process_point_event_student_course_membership_id_course_membership_id_fk" FOREIGN KEY ("student_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "process_point_event_membership_idx" ON "process_point_event" USING btree ("student_course_membership_id");
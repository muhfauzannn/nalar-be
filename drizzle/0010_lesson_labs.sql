CREATE TABLE "lab_challenge_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_lab_id" uuid NOT NULL,
	"student_course_membership_id" uuid NOT NULL,
	"challenge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_challenge_completion_unique" UNIQUE("lesson_lab_id","student_course_membership_id","challenge")
);
--> statement-breakpoint
CREATE TABLE "lesson_lab" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"lab_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_lab_lesson_key_unique" UNIQUE("lesson_id","lab_key")
);
--> statement-breakpoint
ALTER TABLE "lab_challenge_completion" ADD CONSTRAINT "lab_challenge_completion_lesson_lab_id_lesson_lab_id_fk" FOREIGN KEY ("lesson_lab_id") REFERENCES "public"."lesson_lab"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_challenge_completion" ADD CONSTRAINT "lab_challenge_completion_student_course_membership_id_course_membership_id_fk" FOREIGN KEY ("student_course_membership_id") REFERENCES "public"."course_membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_lab" ADD CONSTRAINT "lesson_lab_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_challenge_completion_membership_idx" ON "lab_challenge_completion" USING btree ("student_course_membership_id");
-- School removal: any registered user can own a course and roles live only on
-- course_membership. Written by hand (expand -> backfill -> contract) so that
-- every existing course_membership / student_profile row keeps its user.
-- drizzle runs all pending migrations in ONE transaction, so a failure anywhere
-- (e.g. a duplicate that the new unique constraints reject) leaves the database
-- exactly as it was. Tables are dropped WITHOUT CASCADE on purpose.

-- 1. course_membership: school_membership_id -> user_id
ALTER TABLE "course_membership" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "course_membership" AS cm SET "user_id" = sm."user_id" FROM "school_membership" AS sm WHERE sm."id" = cm."school_membership_id";--> statement-breakpoint
ALTER TABLE "course_membership" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "course_membership" DROP CONSTRAINT "course_membership_course_member_role_unique";--> statement-breakpoint
DROP INDEX "course_membership_member_status_idx";--> statement-breakpoint
ALTER TABLE "course_membership" DROP COLUMN "school_membership_id";--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_course_member_role_unique" UNIQUE("course_id","user_id","role");--> statement-breakpoint
CREATE INDEX "course_membership_member_status_idx" ON "course_membership" USING btree ("user_id","status");--> statement-breakpoint

-- 2. student_profile: keyed by user instead of school membership
ALTER TABLE "student_profile" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "student_profile" AS sp SET "user_id" = sm."user_id" FROM "school_membership" AS sm WHERE sm."id" = sp."membership_id";--> statement-breakpoint
DELETE FROM "student_profile" AS a USING "student_profile" AS b WHERE a."user_id" = b."user_id" AND (a."updated_at" < b."updated_at" OR (a."updated_at" = b."updated_at" AND a."membership_id" < b."membership_id"));--> statement-breakpoint
ALTER TABLE "student_profile" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "student_profile" DROP COLUMN "membership_id";--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_pkey" PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 3. academic_year becomes global reference data
ALTER TABLE "academic_year" DROP CONSTRAINT "academic_year_school_name_unique";--> statement-breakpoint
DROP INDEX "academic_year_one_active_per_school";--> statement-breakpoint
ALTER TABLE "academic_year" DROP COLUMN "school_id";--> statement-breakpoint
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_name_unique" UNIQUE("name");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_year_one_active" ON "academic_year" USING btree ((true)) WHERE "academic_year"."status" = 'active';--> statement-breakpoint

-- 4. subject: one global namespace of codes
DROP INDEX "subject_global_code_unique";--> statement-breakpoint
DROP INDEX "subject_school_code_unique";--> statement-breakpoint
ALTER TABLE "subject" DROP COLUMN "school_id";--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_code_unique" UNIQUE("code");--> statement-breakpoint

-- 5. rubric / scenario are no longer owned by a school
ALTER TABLE "rubric" DROP COLUMN "school_id";--> statement-breakpoint
ALTER TABLE "scenario" DROP COLUMN "school_id";--> statement-breakpoint

-- 6. course: no school, optional term, class join code
DROP INDEX "course_school_status_idx";--> statement-breakpoint
ALTER TABLE "course" DROP COLUMN "school_id";--> statement-breakpoint
ALTER TABLE "course" ALTER COLUMN "term_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "join_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "course_join_code_unique" ON "course" USING btree ("join_code") WHERE "course"."join_code" is not null;--> statement-breakpoint
CREATE INDEX "course_status_idx" ON "course" USING btree ("status");--> statement-breakpoint

-- 7. contract: nothing references the school tables any more
DROP TABLE "school_member_role";--> statement-breakpoint
DROP TABLE "school_membership";--> statement-breakpoint
DROP TABLE "school";--> statement-breakpoint
DROP TYPE "public"."school_role";--> statement-breakpoint
DROP TYPE "public"."membership_status";--> statement-breakpoint

-- 8. reference data: subjects a course creator can choose from (idempotent)
INSERT INTO "subject" ("code", "name") VALUES
	('BIN', 'Bahasa Indonesia'),
	('BING', 'Bahasa Inggris'),
	('MAT', 'Matematika'),
	('FIS', 'Fisika'),
	('KIM', 'Kimia'),
	('BIO', 'Biologi'),
	('SEJ', 'Sejarah'),
	('GEO', 'Geografi'),
	('EKO', 'Ekonomi'),
	('SOS', 'Sosiologi'),
	('INF', 'Informatika'),
	('PKN', 'Pendidikan Pancasila dan Kewarganegaraan'),
	('SBD', 'Seni Budaya'),
	('PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan'),
	('AGM', 'Pendidikan Agama dan Budi Pekerti'),
	('LNY', 'Lainnya')
ON CONFLICT ("code") DO NOTHING;

-- Uploaded PDFs: a 'file' resource may now carry a stored file instead of a URL.
-- Additive only: three nullable columns, and the payload check keeps accepting every
-- row the previous release writes, so the old code keeps working on a migrated DB.
ALTER TABLE "learning_resource" DROP CONSTRAINT "learning_resource_payload_check";--> statement-breakpoint
ALTER TABLE "learning_resource" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "learning_resource" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "learning_resource" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "learning_resource" ADD CONSTRAINT "learning_resource_file_key_unique" UNIQUE("file_key");--> statement-breakpoint
ALTER TABLE "learning_resource" ADD CONSTRAINT "learning_resource_payload_check" CHECK (("learning_resource"."type" = 'text' and "learning_resource"."content" is not null and "learning_resource"."url" is null
          and "learning_resource"."file_key" is null and "learning_resource"."file_name" is null and "learning_resource"."file_size" is null)
        or ("learning_resource"."type" in ('link', 'file') and "learning_resource"."url" is not null
          and "learning_resource"."file_key" is null and "learning_resource"."file_name" is null and "learning_resource"."file_size" is null)
        or ("learning_resource"."type" = 'file' and "learning_resource"."url" is null
          and "learning_resource"."file_key" is not null and "learning_resource"."file_name" is not null
          and "learning_resource"."file_size" is not null and "learning_resource"."file_size" > 0));
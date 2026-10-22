-- Give existing active teachers the same learning access as new course creators.
-- Keep existing student memberships and their progress/status untouched.
INSERT INTO "course_membership" ("course_id", "user_id", "role", "status", "activated_at")
SELECT "course_id", "user_id", 'student', 'active', now()
FROM "course_membership"
WHERE "role" = 'teacher' AND "status" = 'active'
ON CONFLICT ("course_id", "user_id", "role") DO NOTHING;

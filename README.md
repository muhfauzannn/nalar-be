To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

open http://localhost:3000

## Course model

There is no school or tenant. Any registered user can create a course and becomes its
teacher; roles exist only per course (`course_membership.role`). Other users join with
the course's class code and become students.

| Area | Base path | Who |
| --- | --- | --- |
| Learning (existing) | `/api/student/*` | enrolled students |
| Join a course | `POST /api/courses/join` `{ code }` | any signed-in user |
| Authoring | `/api/manage/*` | active teacher of the course that owns the id |

Authoring covers courses, modules, lessons, resources, quizzes (with questions) and
assignments (scenario + private rubric copy). Rules worth knowing:

- An id that belongs to someone else answers exactly like an id that does not exist (404).
- `DELETE` never removes rows that carry student data; it archives.
- A quiz/assignment is editable only while it is a **draft nobody has started**. After the
  first attempt/submission its questions, answer key, time limit, instructions and rubric
  are frozen; duplicate it for a new version.
- Publishing a quiz needs at least one valid question (`src/lib/quiz-readiness.ts` is the
  one definition used by both teachers and students).
- A `link` or URL-only `file` resource must be `http(s)`. A `file` resource can instead be an
  **uploaded PDF** (see below).
- Joining is rate limited per account (10 wrong codes / 10 min) and so is opening AI Tutor
  sessions. Both limiters are in memory: move them to the database or Redis before running
  more than one replica.

## Uploaded files (PDF)

A teacher attaches a PDF to a lesson with `POST /api/manage/lessons/:lessonId/resources/upload`
(multipart: `title`, optional `content`, `file`). `PUT /api/manage/resources/:resourceId/file`
replaces the file (and the words) of an existing resource. Rules:

- PDF only, checked by content (`%PDF-`), not by the name or the type the browser reports.
  At most 20 MB per file; an oversized body is refused before it is read (413).
- One account may keep at most 500 MB of PDFs across the courses they teach (soft cap).
- The file is stored under a server-generated key (`resources/<uuid>.pdf`); the original name
  is cleaned and kept only for display. The key is never sent to clients, which see
  `file: { name, size }`.
- Download: `GET /api/student/resources/:id/file` (same visibility as the lesson itself:
  enrolled student, published lesson/module, published or archived course) and
  `GET /api/manage/resources/:id/file` (the course's teacher). Served inline with
  `nosniff`; add `?download=1` to force a save. Anyone else gets 404.
- Deleting a resource, replacing its file, or turning it into a link/text removes the
  object. A crash between the two steps can leave an orphan object (wasted space, never a
  dangling row).

### Where the files live

`STORAGE_DRIVER` picks the store (`src/lib/file-storage.ts`; three methods: `save`, `read`,
`remove`):

| Driver | Use | Config |
| --- | --- | --- |
| `disk` (default) | development and tests | `UPLOAD_DIR` (default `./uploads`) |
| `s3` | production: Cloudflare R2, or any S3-compatible store | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_REGION` (default `auto`) |

Production (`docker-compose.dokploy.yml` sets `STORAGE_DRIVER=s3`; put the `S3_*` values in
`../persistent/be.env`, never in git):

1. Cloudflare dashboard -> R2 -> create a bucket. Keep it **private**: no public access, no
   `r2.dev` URL, no custom domain. Files are only ever served by this API, after the access check.
2. R2 -> Manage API tokens -> create a token with **Object Read & Write**, limited to that
   one bucket. Copy the Access Key ID and Secret Access Key.
3. `S3_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com` (no bucket in the URL).
4. After deploying, prove it works without touching the UI:
   `docker exec <be-container> bun run storage:check`. It writes a tiny object, reads it
   back, deletes it, and prints which step failed (and why) if one does. Credentials are
   never printed.

If `STORAGE_DRIVER=s3` is set but a variable is missing, the API still starts (login,
courses, quizzes keep working); uploads and downloads answer `503 STORAGE_UNAVAILABLE` and the
missing variable names are logged at start-up. A storage failure that is not "the file does not
exist" (wrong key, wrong bucket, network) is a 500 and is logged, never a misleading 404.

R2 does not need CORS: the browser talks to this API, not to the bucket. Back-ups are the
provider's job, but note that a database restore and the bucket are independent: restoring
the database to an earlier point leaves newer objects orphaned (harmless) and never the reverse.

## Database

`db:migrate` runs automatically when the container starts (see `Dockerfile`), against
whatever `DATABASE_URL` points to. `db:reset` truncates **every** table. Never run either
against a database you care about without checking `DATABASE_URL` first.

Migration `0006_resource_files.sql` only adds three nullable columns to `learning_resource`
(and widens its payload check), so the previous release keeps working on a migrated
database; `test/migration-0006.test.ts` proves it on existing rows.

Migration `0005_school_removal.sql` is hand-written (expand, backfill, contract) and runs
in one transaction; `test/migration-0005.test.ts` proves it on a database that already
holds data, and that a failure leaves the database untouched. Rehearse any migration on a
copy of production (a Neon branch works) before deploying it.

## Tests

The suite uses a real Postgres (no mocks): it creates a throw-away database, applies the
real migrations, and drops it afterwards.

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun test
bun run typecheck
```

`TEST_DATABASE_URL` must point at the `postgres` database of a **local** server (hosted
servers such as Neon are refused). A quick one:

```sh
docker run -d --name nalar-test-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17-alpine
```

CI runs the same two commands before it deploys. The upload and storage tests run twice:
once on the `disk` driver, and once against a real S3-compatible server (RustFS, started by
the workflow), so the `s3` driver is exercised on every push:

```sh
docker run -d --name nalar-test-s3 -p 9000:9000 -e RUSTFS_ACCESS_KEY=rustfsadmin \
  -e RUSTFS_SECRET_KEY=rustfsadmin rustfs/rustfs
AWS_ACCESS_KEY_ID=rustfsadmin AWS_SECRET_ACCESS_KEY=rustfsadmin AWS_DEFAULT_REGION=auto \
  aws --endpoint-url http://localhost:9000 s3 mb s3://nalar-test
TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_BUCKET=nalar-test \
  TEST_S3_ACCESS_KEY_ID=rustfsadmin TEST_S3_SECRET_ACCESS_KEY=rustfsadmin \
  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun test
```

(R2 and AWS hosts are refused as `TEST_S3_ENDPOINT`, like hosted Postgres for the database.)

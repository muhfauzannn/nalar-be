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
- Resource URLs must be `http(s)`. Files are links; nothing is uploaded.
- Joining is rate limited per account (10 wrong codes / 10 min) and so is opening AI Tutor
  sessions. Both limiters are in memory: move them to the database or Redis before running
  more than one replica.

## Database

`db:migrate` runs automatically when the container starts (see `Dockerfile`), against
whatever `DATABASE_URL` points to. `db:reset` truncates **every** table. Never run either
against a database you care about without checking `DATABASE_URL` first.

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

CI runs the same two commands before it deploys.

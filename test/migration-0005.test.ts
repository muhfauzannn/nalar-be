import { afterAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Migration 0005 removes the school concept. It is the one change in this
// feature that touches data that already exists in production, so it gets its
// own test: build the OLD schema, load realistic rows, run 0005, and check that
// nothing was lost or re-pointed to the wrong person.

const adminUrl = process.env.TEST_DATABASE_URL!;
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const created: string[] = [];

function urlFor(name: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

// Copy migrations 0000-0004 (and a journal that stops there) to a temp folder.
function oldMigrationsFolder() {
  const folder = mkdtempSync(join(tmpdir(), "nalar-old-migrations-"));
  mkdirSync(join(folder, "meta"));
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"));
  const keep = journal.entries.filter((entry: { idx: number }) => entry.idx <= 4);
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: keep }));
  for (const entry of keep) cpSync(`./drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
  return folder;
}

async function databaseAtVersion4() {
  const name = `nalar_mig_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await admin.unsafe(`create database ${name}`);
  created.push(name);
  const client = postgres(urlFor(name), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: oldMigrationsFolder() });
  return { name, client };
}

const id = () => crypto.randomUUID();

async function loadOldWorldFixture(sql: postgres.Sql) {
  const f = {
    teacher: id(), student: id(), newcomer: id(),
    school1: id(), school2: id(),
    smTeacher: id(), smStudent1: id(), smStudent2: id(),
    year1: id(), year2: id(), term1: id(), term2: id(),
    subject: id(),
    course1: id(), course2: id(),
    cmTeacher: id(), cmStudent1: id(), cmStudent2: id(),
    module: id(), lesson: id(), progress: id(),
    quiz: id(), attempt: id(),
  };

  await sql`insert into "user" (id, name, email) values
    (${f.teacher}, 'Guru', ${`g-${f.teacher}@x.test`}),
    (${f.student}, 'Siswa', ${`s-${f.student}@x.test`}),
    (${f.newcomer}, 'Pendatang', ${`n-${f.newcomer}@x.test`})`;
  await sql`insert into school (id, name, slug) values
    (${f.school1}, 'Sekolah Satu', ${`s1-${f.school1}`}), (${f.school2}, 'Sekolah Dua', ${`s2-${f.school2}`})`;
  await sql`insert into school_membership (id, school_id, user_id, status, joined_at) values
    (${f.smTeacher}, ${f.school1}, ${f.teacher}, 'active', now()),
    (${f.smStudent1}, ${f.school1}, ${f.student}, 'active', now()),
    (${f.smStudent2}, ${f.school2}, ${f.student}, 'active', now())`;
  await sql`insert into school_member_role (membership_id, role) values
    (${f.smTeacher}, 'teacher'), (${f.smStudent1}, 'student'), (${f.smStudent2}, 'student')`;
  // The same person has a profile in two schools: the newer one must win.
  await sql`insert into student_profile (membership_id, grade_level, updated_at) values
    (${f.smStudent1}, 11, '2026-01-01'), (${f.smStudent2}, 12, '2026-06-01')`;
  await sql`insert into academic_year (id, school_id, name, starts_on, ends_on, status) values
    (${f.year1}, ${f.school1}, '2026/2027', '2026-07-01', '2027-06-30', 'active'),
    (${f.year2}, ${f.school2}, '2025/2026', '2025-07-01', '2026-06-30', 'archived')`;
  await sql`insert into academic_term (id, academic_year_id, name, position, starts_on, ends_on) values
    (${f.term1}, ${f.year1}, 'Ganjil', 1, '2026-07-01', '2026-12-31'),
    (${f.term2}, ${f.year2}, 'Genap', 1, '2026-01-01', '2026-06-30')`;
  await sql`insert into subject (id, school_id, code, name) values (${f.subject}, ${f.school1}, 'MAT-X', 'Matematika Khusus')`;
  await sql`insert into course (id, school_id, term_id, subject_id, name, status) values
    (${f.course1}, ${f.school1}, ${f.term1}, ${f.subject}, 'Kelas Satu', 'published'),
    (${f.course2}, ${f.school2}, ${f.term2}, ${f.subject}, 'Kelas Dua', 'published')`;
  await sql`insert into course_membership (id, course_id, school_membership_id, role, status) values
    (${f.cmTeacher}, ${f.course1}, ${f.smTeacher}, 'teacher', 'active'),
    (${f.cmStudent1}, ${f.course1}, ${f.smStudent1}, 'student', 'active'),
    (${f.cmStudent2}, ${f.course2}, ${f.smStudent2}, 'student', 'completed')`;
  await sql`insert into learning_module (id, course_id, title, position, status) values (${f.module}, ${f.course1}, 'M', 1, 'published')`;
  await sql`insert into lesson (id, module_id, title, position, status) values (${f.lesson}, ${f.module}, 'L', 1, 'published')`;
  await sql`insert into lesson_progress (id, lesson_id, student_course_membership_id, status) values (${f.progress}, ${f.lesson}, ${f.cmStudent1}, 'completed')`;
  await sql`insert into quiz (id, course_id, created_by_course_membership_id, title, status) values (${f.quiz}, ${f.course1}, ${f.cmTeacher}, 'Kuis', 'published')`;
  await sql`insert into quiz_attempt (id, quiz_id, student_course_membership_id, status, score) values (${f.attempt}, ${f.quiz}, ${f.cmStudent1}, 'submitted', 80.00)`;
  return f;
}

afterAll(async () => {
  for (const name of created) await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.end();
});

describe("migration 0005 (school removal) on a database that already holds data", () => {
  test("every membership keeps its user; nothing that referenced a membership is orphaned", async () => {
    const { name, client } = await databaseAtVersion4();
    const f = await loadOldWorldFixture(client);

    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });

    const memberships = await client`select id, user_id, role, status from course_membership order by id`;
    const byId = new Map(memberships.map((row) => [row.id, row]));
    expect(memberships).toHaveLength(3);
    expect(byId.get(f.cmTeacher)).toMatchObject({ user_id: f.teacher, role: "teacher", status: "active" });
    expect(byId.get(f.cmStudent1)).toMatchObject({ user_id: f.student, role: "student", status: "active" });
    // enrolled through the student's OTHER school: still the same person
    expect(byId.get(f.cmStudent2)).toMatchObject({ user_id: f.student, role: "student", status: "completed" });

    // ids of memberships are unchanged, so dependants still line up
    const [attempt] = await client`select student_course_membership_id as cm, status, score::text from quiz_attempt where id = ${f.attempt}`;
    expect(attempt).toMatchObject({ cm: f.cmStudent1, status: "submitted", score: "80.00" });
    const [progress] = await client`select student_course_membership_id as cm, status from lesson_progress where id = ${f.progress}`;
    expect(progress).toMatchObject({ cm: f.cmStudent1, status: "completed" });
    const [quizRow] = await client`select created_by_course_membership_id as cm from quiz where id = ${f.quiz}`;
    expect(quizRow!.cm).toBe(f.cmTeacher);

    // the same-role-twice rule is enforced for the new key
    await expect(
      (async () => {
        await client`insert into course_membership (course_id, user_id, role) values (${f.course1}, ${f.student}, 'student')`;
      })(),
    ).rejects.toThrow();

    await client.end();
    expect(name).toStartWith("nalar_mig_");
  });

  test("one profile per person survives, the most recently updated one", async () => {
    const { client } = await databaseAtVersion4();
    const f = await loadOldWorldFixture(client);
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });

    const profiles = await client`select user_id, grade_level from student_profile`;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ user_id: f.student, grade_level: 12 });
    await client.end();
  });

  test("courses, terms, subjects and modules are kept; the school objects are gone", async () => {
    const { client } = await databaseAtVersion4();
    const f = await loadOldWorldFixture(client);
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });

    const courses = await client`select id, term_id, subject_id, name, join_code from course order by name`;
    expect(courses.map((row) => [row.name, row.term_id, row.join_code])).toEqual([
      ["Kelas Dua", f.term2, null],
      ["Kelas Satu", f.term1, null],
    ]);
    const [subject] = await client`select code, name from subject where id = ${f.subject}`;
    expect(subject).toEqual({ code: "MAT-X", name: "Matematika Khusus" });
    const { total } = (await client`select count(*)::int as total from subject`)[0]!;
    expect(total).toBe(17); // 1 existing + 16 reference subjects

    const leftovers = await client`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'school%'`;
    expect(leftovers).toHaveLength(0);
    const { applied } = (await client`select count(*)::int as applied from drizzle.__drizzle_migrations`)[0]!;
    // every migration in the journal, whatever comes after 0005
    expect(applied).toBe(JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")).entries.length);

    // a course can now exist without a term
    const [orphanTerm] = await client`insert into course (subject_id, name) values (${f.subject}, 'Tanpa semester') returning term_id`;
    expect(orphanTerm!.term_id).toBeNull();
    await client.end();
  });

  test("an empty database (a fresh install) migrates too", async () => {
    const { client } = await databaseAtVersion4();
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const { total } = (await client`select count(*)::int as total from subject`)[0]!;
    expect(total).toBe(16);
    await client.end();
  });

  test("when 0005 cannot apply, it applies NOTHING (all-or-nothing)", async () => {
    const { client } = await databaseAtVersion4();
    const f = await loadOldWorldFixture(client);
    // Two schools each with an ACTIVE year: legal before, impossible after
    // (`academic_year_one_active`). The failing statement is deep inside 0005,
    // after earlier statements already succeeded.
    await client`update academic_year set status = 'active' where id = ${f.year2}`;

    await expect(migrate(drizzle(client), { migrationsFolder: "./drizzle" })).rejects.toThrow();

    // Exactly the old world, untouched:
    const tables = await client`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'school%' order by 1`;
    expect(tables.map((row) => row.table_name)).toEqual(["school", "school_member_role", "school_membership"]);
    const columns = await client`select column_name from information_schema.columns where table_name = 'course_membership' order by 1`;
    const names = columns.map((row) => row.column_name);
    expect(names).toContain("school_membership_id");
    expect(names).not.toContain("user_id");
    const { applied } = (await client`select count(*)::int as applied from drizzle.__drizzle_migrations`)[0]!;
    expect(applied).toBe(5);
    const { memberships } = (await client`select count(*)::int as memberships from course_membership`)[0]!;
    expect(memberships).toBe(3);
    const { subjects } = (await client`select count(*)::int as subjects from subject`)[0]!;
    expect(subjects).toBe(1); // the reference-subject INSERT was rolled back too

    await client.end();
  });
});

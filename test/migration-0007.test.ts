import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

test("migration 0007 enrolls existing active teachers once and preserves existing learning memberships", async () => {
  const adminUrl = process.env.TEST_DATABASE_URL!;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  const name = `nalar_mig_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const folder = mkdtempSync(join(tmpdir(), "nalar-before-self-enrollment-"));
  let client: ReturnType<typeof postgres> | undefined;
  try {
    mkdirSync(join(folder, "meta"));
    const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"));
    const entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 6);
    writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const entry of entries) cpSync(`./drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
    await admin.unsafe(`create database ${name}`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder: folder });

    const [legacy, completed, removed, inactive] = Array.from({ length: 4 }, () => crypto.randomUUID());
    for (const id of [legacy, completed, removed, inactive]) {
      await client`insert into "user" (id, name, email) values (${id!}, 'Teacher', ${`${id}@test.local`})`;
    }
    const [subject] = await client`select id from subject limit 1`;
    const [course] = await client`insert into course (subject_id, name, status)
      values (${subject!.id}, 'Existing course', 'published') returning id`;
    await client`insert into course_membership (course_id, user_id, role, status) values
      (${course!.id}, ${legacy!}, 'teacher', 'active'),
      (${course!.id}, ${completed!}, 'teacher', 'active'),
      (${course!.id}, ${removed!}, 'teacher', 'active'),
      (${course!.id}, ${inactive!}, 'teacher', 'removed'),
      (${course!.id}, ${completed!}, 'student', 'completed'),
      (${course!.id}, ${removed!}, 'student', 'removed')`;
    const before = await client`select * from course_membership order by id`;

    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const after = await client`select * from course_membership order by id`;
    expect(after).toHaveLength(before.length + 1);
    for (const row of before) expect(after.find((entry) => entry.id === row.id)).toEqual(row);
    const enrolled = after.find((entry) => entry.user_id === legacy && entry.role === "student");
    expect(enrolled).toMatchObject({ course_id: course!.id, status: "active" });
    expect(enrolled!.activated_at).toBeTruthy();
    expect(after.some((entry) => entry.user_id === inactive && entry.role === "student")).toBe(false);

    // Retrying the backfill itself is safe, independent of migration bookkeeping.
    await client.unsafe(readFileSync("./drizzle/0007_teacher_self_enrollment.sql", "utf8"));
    expect([...(await client`select * from course_membership order by id`)]).toEqual([...after]);
  } finally {
    await client?.end();
    await admin.unsafe(`drop database if exists ${name} with (force)`);
    await admin.end();
    rmSync(folder, { recursive: true, force: true });
  }
});

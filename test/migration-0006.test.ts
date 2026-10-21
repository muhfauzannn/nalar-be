import { afterAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Migration 0006 adds stored files to learning_resource. Existing rows (text, link and
// URL-only 'file') must come through untouched, and the previous release's inserts
// must keep working against the migrated table.

const adminUrl = process.env.TEST_DATABASE_URL!;
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const created: string[] = [];

function urlFor(name: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function migrationsUpTo(lastIdx: number) {
  const folder = mkdtempSync(join(tmpdir(), "nalar-old-migrations-"));
  mkdirSync(join(folder, "meta"));
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"));
  const keep = journal.entries.filter((entry: { idx: number }) => entry.idx <= lastIdx);
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: keep }));
  for (const entry of keep) cpSync(`./drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
  return folder;
}

async function databaseAtVersion5() {
  const name = `nalar_mig_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  await admin.unsafe(`create database ${name}`);
  created.push(name);
  const client = postgres(urlFor(name), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: migrationsUpTo(5) });
  return client;
}

// postgres.js queries are lazy, so they are awaited here instead of handed to `expect().rejects`.
async function isRejected(run: () => PromiseLike<unknown>) {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
}

afterAll(async () => {
  for (const name of created) await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.end();
});

describe("migration 0006 (uploaded resource files)", () => {
  test("existing resources are kept as they were, and the old way of writing them still works", async () => {
    const sql = await databaseAtVersion5();
    const [subject] = await sql`select id from subject limit 1`;
    const [course] = await sql`insert into course (subject_id, name) values (${subject!.id}, 'Lama') returning id`;
    const [module] = await sql`insert into learning_module (course_id, title, position) values (${course!.id}, 'M', 1) returning id`;
    const [lesson] = await sql`insert into lesson (module_id, title, position) values (${module!.id}, 'L', 1) returning id`;
    await sql`insert into learning_resource (lesson_id, type, title, content, url, position) values
      (${lesson!.id}, 'text', 'Catatan', 'isi', null, 1),
      (${lesson!.id}, 'link', 'Tautan', null, 'https://example.org/', 2),
      (${lesson!.id}, 'file', 'PDF Drive', 'hal 3', 'https://example.org/a.pdf', 3)`;

    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

    const rows = await sql`select type, title, content, url, file_key, file_name, file_size from learning_resource order by position`;
    expect(rows.map((row) => ({ ...row }))).toEqual([
      { type: "text", title: "Catatan", content: "isi", url: null, file_key: null, file_name: null, file_size: null },
      { type: "link", title: "Tautan", content: null, url: "https://example.org/", file_key: null, file_name: null, file_size: null },
      { type: "file", title: "PDF Drive", content: "hal 3", url: "https://example.org/a.pdf", file_key: null, file_name: null, file_size: null },
    ]);

    // what the previous release writes (no file columns at all) is still accepted ...
    await sql`insert into learning_resource (lesson_id, type, title, url, position) values (${lesson!.id}, 'file', 'Lagi', 'https://example.org/b.pdf', 4)`;
    // ... and the new shape is, while mixed shapes are not
    await sql`insert into learning_resource (lesson_id, type, title, file_key, file_name, file_size, position)
      values (${lesson!.id}, 'file', 'Unggahan', 'resources/00000000-0000-4000-8000-000000000001.pdf', 'a.pdf', 12, 5)`;
    expect(
      await isRejected(
        () => sql`insert into learning_resource (lesson_id, type, title, url, file_key, file_name, file_size, position)
          values (${lesson!.id}, 'file', 'Campur', 'https://x.org', 'resources/00000000-0000-4000-8000-000000000002.pdf', 'a.pdf', 12, 6)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        () => sql`insert into learning_resource (lesson_id, type, title, file_key, file_name, position)
          values (${lesson!.id}, 'file', 'Tanpa ukuran', 'resources/00000000-0000-4000-8000-000000000003.pdf', 'a.pdf', 7)`,
      ),
    ).toBe(true);
    await sql.end();
  });
});

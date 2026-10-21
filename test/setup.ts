// Runs before every test file. Builds a throw-away Postgres database, applies the
// real migrations to it, and points the app at it. Tests therefore exercise the
// same SQL, constraints and indexes production does - nothing is mocked.
import { afterAll } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const adminUrl = process.env.TEST_DATABASE_URL?.trim();
if (!adminUrl) {
  throw new Error(
    "TEST_DATABASE_URL wajib diisi (koneksi ke database 'postgres' di server Postgres LOKAL). " +
      "Contoh: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun test",
  );
}
const admin = new URL(adminUrl);
// Tests create and drop databases; never let them near a hosted server.
if (admin.hostname.endsWith("neon.tech") || admin.hostname.endsWith("amazonaws.com")) {
  throw new Error(`Menolak menjalankan test terhadap host remote: ${admin.hostname}`);
}

const databaseName = `nalar_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminClient = postgres(adminUrl, { max: 1 });
await adminClient.unsafe(`create database ${databaseName}`);

const testUrl = new URL(adminUrl);
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();

process.env.BETTER_AUTH_SECRET ??= "test-secret-with-at-least-thirty-two-characters";
process.env.BETTER_AUTH_URL ??= "http://localhost:8000";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.TRUSTED_ORIGIN ??= "http://localhost:5173";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
delete process.env.GEMINI_API_KEY; // AI paths must degrade gracefully, never call out

const migrationClient = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
await migrationClient.end();

afterAll(async () => {
  await adminClient.unsafe(`drop database if exists ${databaseName} with (force)`);
  await adminClient.end();
});

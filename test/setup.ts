// Runs before every test file. Builds a throw-away Postgres database, applies the
// real migrations to it, and points the app at it. Tests therefore exercise the
// same SQL, constraints and indexes production does - nothing is mocked.
import { afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Uploaded files go to a throw-away directory, never to ./uploads, unless the run is
// pointed at an S3-compatible server with TEST_S3_* (the same suite then proves the S3
// driver). Tests may only write their own generated keys, but never aim them at a real
// store: R2 and AWS hosts are refused, like hosted Postgres above.
const uploadDir = await mkdtemp(join(tmpdir(), "nalar-uploads-"));
process.env.UPLOAD_DIR = uploadDir;
for (const name of ["STORAGE_DRIVER", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION"]) {
  delete process.env[name];
}
const testS3 = process.env.TEST_S3_ENDPOINT?.trim();
if (testS3) {
  const host = new URL(testS3).hostname;
  if (host.endsWith("r2.cloudflarestorage.com") || host.endsWith("amazonaws.com")) {
    throw new Error(`Menolak menjalankan test terhadap penyimpanan remote: ${host}`);
  }
  process.env.STORAGE_DRIVER = "s3";
  process.env.S3_ENDPOINT = testS3;
  process.env.S3_BUCKET = process.env.TEST_S3_BUCKET ?? "nalar-test";
  process.env.S3_ACCESS_KEY_ID = process.env.TEST_S3_ACCESS_KEY_ID ?? "";
  process.env.S3_SECRET_ACCESS_KEY = process.env.TEST_S3_SECRET_ACCESS_KEY ?? "";
}

const migrationClient = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
await migrationClient.end();

afterAll(async () => {
  await rm(uploadDir, { recursive: true, force: true });
  await adminClient.unsafe(`drop database if exists ${databaseName} with (force)`);
  await adminClient.end();
});

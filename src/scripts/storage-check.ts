// Proves the configured file storage works end to end, with the same code the API uses:
// write a tiny PDF-looking object, read it back, delete it, confirm it is gone.
//   bun run storage:check          (in the production container: docker exec <be> bun run storage:check)
// It never prints credentials, and it leaves nothing behind when it succeeds.
import { env } from "../config/env";
import { fileStorage, newResourceKey } from "../lib/file-storage";

const storage = env.storage;
const where =
  storage.driver === "disk"
    ? `disk: ${storage.uploadDir}`
    : storage.driver === "s3"
      ? `s3: bucket "${storage.bucket}" di ${storage.endpoint}`
      : `s3 (belum lengkap): ${storage.problems.join("; ")}`;
console.log(`Penyimpanan file -> ${where}`);
// The steps below report what failed themselves; the storage layer's own log line would repeat it.
console.error = () => {};

const key = newResourceKey();
const bytes = new TextEncoder().encode(`%PDF-1.4\n% storage-check ${new Date().toISOString()}\n%%EOF\n`);

async function step(name: string, run: () => Promise<void>) {
  const started = performance.now();
  try {
    await run();
    console.log(`  ok    ${name} (${Math.round(performance.now() - started)} ms)`);
  } catch (error) {
    const { name: type, code, message } = error as { name?: string; code?: string; message?: string };
    console.log(`  GAGAL ${name}: ${[type, code, message].filter(Boolean).join(" | ")}`);
    // best effort: do not leave the probe object behind
    await fileStorage.remove(key).catch(() => {});
    process.exit(1);
  }
}

await step("simpan", () => fileStorage.save(key, bytes));
await step("baca kembali (isi sama persis)", async () => {
  const stored = await fileStorage.read(key);
  if (!stored) throw new Error("objek yang baru disimpan tidak ditemukan");
  const read = new Uint8Array(await new Response(stored.stream).arrayBuffer());
  if (stored.size !== bytes.length || Buffer.compare(read, bytes) !== 0) {
    throw new Error("isi yang dibaca berbeda dari yang disimpan");
  }
});
await step("hapus", () => fileStorage.remove(key));
await step("pastikan sudah hilang", async () => {
  if (await fileStorage.read(key)) throw new Error("objek masih ada setelah dihapus");
});

console.log("Penyimpanan file berfungsi.");
process.exit(0);

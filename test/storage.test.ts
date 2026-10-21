import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadEnv } from "../src/config/env";
import {
  createDiskStorage,
  createS3Storage,
  createStorage,
  newResourceKey,
  StorageUnavailableError,
  type FileStorage,
} from "../src/lib/file-storage";
import { makePdf } from "./helpers";

// The same contract is run against every driver. The S3 half needs an S3-compatible
// server (see README: TEST_S3_*); without one it is skipped and only disk is proven.
const s3 = process.env.TEST_S3_ENDPOINT
  ? {
      endpoint: process.env.TEST_S3_ENDPOINT,
      bucket: process.env.TEST_S3_BUCKET ?? "nalar-test",
      accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "",
      region: "auto",
    }
  : null;

const drivers: Array<{ name: string; skip: boolean; make: () => Promise<FileStorage> }> = [
  {
    name: "disk",
    skip: false,
    make: async () => createDiskStorage(await mkdtemp(join(tmpdir(), "nalar-storage-"))),
  },
  { name: "s3", skip: s3 === null, make: async () => createS3Storage({ driver: "s3", ...s3! }) },
];

const readAll = async (stored: { stream: ReadableStream<Uint8Array> }) =>
  new Uint8Array(await new Response(stored.stream).arrayBuffer());

for (const driver of drivers) {
  describe.skipIf(driver.skip)(`file storage contract: ${driver.name}`, () => {
    test("what is saved is read back byte for byte, with its size", async () => {
      const storage = await driver.make();
      const key = newResourceKey();
      const bytes = makePdf("isi", 3000);
      await storage.save(key, bytes);
      const stored = await storage.read(key);
      expect(stored?.size).toBe(bytes.length);
      expect(await readAll(stored!)).toEqual(bytes);
      await storage.remove(key);
    });

    test("a file at the size limit survives (large uploads are sent in several parts)", async () => {
      const storage = await driver.make();
      const key = newResourceKey();
      const bytes = makePdf("besar", 20 * 1024 * 1024);
      for (let i = 0; i < bytes.length; i += 1_000_003) bytes[i] = (i / 1_000_003) % 251; // not all one byte
      bytes.set(new TextEncoder().encode("%PDF-1.4"));
      await storage.save(key, bytes);
      const stored = await storage.read(key);
      expect(stored?.size).toBe(bytes.length);
      expect(Buffer.compare(await readAll(stored!), bytes)).toBe(0);
      await storage.remove(key);
    });

    test("a file that does not exist reads as null, and saving over a key replaces it", async () => {
      const storage = await driver.make();
      const key = newResourceKey();
      expect(await storage.read(key)).toBeNull();
      await storage.save(key, makePdf("satu"));
      await storage.save(key, makePdf("dua dua", 500));
      const stored = await storage.read(key);
      expect(stored?.size).toBe(500);
      expect(new TextDecoder().decode((await readAll(stored!)).slice(0, 8))).toBe("%PDF-1.4");
      await storage.remove(key);
    });

    test("removing deletes the file, and removing it again is not an error", async () => {
      const storage = await driver.make();
      const key = newResourceKey();
      await storage.save(key, makePdf("hapus"));
      await storage.remove(key);
      expect(await storage.read(key)).toBeNull();
      await storage.remove(key);
    });

    test("only generated keys are accepted", async () => {
      const storage = await driver.make();
      const bytes = makePdf("x");
      const bad = [
        "../x.pdf",
        "resources/../../x.pdf",
        "/etc/passwd",
        "resources/abc.pdf",
        `resources/${crypto.randomUUID()}.html`,
        `resources/${crypto.randomUUID()}.pdf/../../x`,
        "",
      ];
      for (const key of bad) {
        await expect(storage.save(key, bytes)).rejects.toThrow("Kunci file tidak valid");
        await expect(storage.read(key)).rejects.toThrow("Kunci file tidak valid");
        await expect(storage.remove(key)).rejects.toThrow("Kunci file tidak valid");
      }
    });
  });
}

describe("disk driver details", () => {
  test("no half-written file is left next to the final one", async () => {
    const root = await mkdtemp(join(tmpdir(), "nalar-storage-"));
    const storage = createDiskStorage(root);
    const key = newResourceKey();
    await storage.save(key, makePdf("rapi"));
    expect(await readdir(join(root, "resources"))).toEqual([key.replace("resources/", "")]);
    await storage.remove(key);
  });
});

describe.skipIf(s3 === null)("s3 driver details", () => {
  test("objects are stored as application/pdf, so a bucket browser or a stray public link would not sniff them", async () => {
    const storage = createS3Storage({ driver: "s3", ...s3! });
    const key = newResourceKey();
    await storage.save(key, makePdf("tipe"));
    expect((await new Bun.S3Client(s3!).file(key).stat()).type).toBe("application/pdf");
    await storage.remove(key);
  });
});

describe.skipIf(s3 === null)("s3 driver failures are never mistaken for 'no such file'", () => {
  const bytes = makePdf("gagal");
  const quiet = () => spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => (console.error as unknown as { mockRestore?: () => void }).mockRestore?.());

  test("wrong credentials fail loudly on save and read, and the secret is not logged", async () => {
    const log = quiet();
    const storage = createS3Storage({ driver: "s3", ...s3!, secretAccessKey: "rahasia-yang-salah-123" });
    const key = newResourceKey();
    await expect(storage.save(key, bytes)).rejects.toThrow();
    await expect(storage.read(key)).rejects.toThrow();
    const logged = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("Penyimpanan S3 gagal");
    expect(logged).not.toContain("rahasia-yang-salah-123");
    expect(logged).not.toContain(s3!.secretAccessKey || "<kosong>");
  });

  test("a missing bucket fails loudly instead of reporting an empty store", async () => {
    quiet();
    const storage = createS3Storage({ driver: "s3", ...s3!, bucket: `tidak-ada-${crypto.randomUUID().slice(0, 8)}` });
    const key = newResourceKey();
    await expect(storage.read(key)).rejects.toThrow();
    await expect(storage.save(key, bytes)).rejects.toThrow();
  });

  test("an unreachable server fails loudly", async () => {
    quiet();
    const storage = createS3Storage({ driver: "s3", ...s3!, endpoint: "http://127.0.0.1:9" });
    await expect(storage.read(newResourceKey())).rejects.toThrow();
    await expect(storage.save(newResourceKey(), bytes)).rejects.toThrow();
  });
});

describe("storage configuration", () => {
  const base = {
    DATABASE_URL: "postgresql://x/y",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:8000",
    FRONTEND_URL: "http://localhost:5173",
    TRUSTED_ORIGIN: "http://localhost:5173",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
  };
  const full = {
    STORAGE_DRIVER: "s3",
    S3_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
    S3_BUCKET: "nalar-files",
    S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
    S3_SECRET_ACCESS_KEY: "sekrit-value-1234567890",
  };

  test("disk is the default, and UPLOAD_DIR moves it", () => {
    expect(loadEnv(base).storage).toEqual({ driver: "disk", uploadDir: join(process.cwd(), "uploads") });
    expect(loadEnv({ ...base, UPLOAD_DIR: "/srv/files" }).storage).toEqual({ driver: "disk", uploadDir: "/srv/files" });
  });

  test("a complete s3 setup is used, with region 'auto' unless set", () => {
    expect(loadEnv({ ...base, ...full }).storage).toEqual({
      driver: "s3",
      endpoint: full.S3_ENDPOINT,
      bucket: full.S3_BUCKET,
      accessKeyId: full.S3_ACCESS_KEY_ID,
      secretAccessKey: full.S3_SECRET_ACCESS_KEY,
      region: "auto",
    });
    expect((loadEnv({ ...base, ...full, S3_REGION: "ap-southeast-1" }).storage as { region: string }).region).toBe("ap-southeast-1");
  });

  test("a half-filled s3 setup does not stop the API: it is 'unconfigured' and names what is missing", () => {
    const { storage } = loadEnv({ ...base, STORAGE_DRIVER: "s3", S3_SECRET_ACCESS_KEY: full.S3_SECRET_ACCESS_KEY });
    expect(storage).toEqual({
      driver: "unconfigured",
      problems: ["S3_ENDPOINT belum diisi", "S3_BUCKET belum diisi", "S3_ACCESS_KEY_ID belum diisi"],
    });
    expect(JSON.stringify(storage)).not.toContain(full.S3_SECRET_ACCESS_KEY); // never echo a secret
    expect(loadEnv({ ...base, ...full, S3_ENDPOINT: "bukan url" }).storage).toEqual({
      driver: "unconfigured",
      problems: ["S3_ENDPOINT bukan URL yang valid"],
    });
    // s3 variables alone, without choosing the driver, change nothing
    expect(loadEnv({ ...base, ...full, STORAGE_DRIVER: undefined }).storage.driver).toBe("disk");
  });

  test("an unknown driver is a mistake worth stopping for", () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: "gcs" })).toThrow("STORAGE_DRIVER");
  });

  test("unconfigured storage refuses every operation with StorageUnavailableError", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const storage = createStorage({ driver: "unconfigured", problems: ["S3_BUCKET belum diisi"] });
    expect(log.mock.calls[0]?.[0]).toContain("S3_BUCKET belum diisi");
    log.mockRestore();
    const key = newResourceKey();
    await expect(storage.save(key, makePdf())).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.read(key)).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(storage.remove(key)).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

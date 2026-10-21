import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { env, type StorageConfig } from "../config/env";

// Files are addressed by a key the server generates (never by anything a client
// sent), and every driver refuses any other key.
const KEY = /^resources\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

export function newResourceKey() {
  return `resources/${crypto.randomUUID()}.pdf`;
}

function checkedKey(key: string) {
  if (!KEY.test(key)) throw new Error(`Kunci file tidak valid: ${key}`);
  return key;
}

export type StoredStream = { stream: ReadableStream<Uint8Array>; size: number };

// The three things the app does with a file. `read` answers null only when the file
// does not exist; any other failure (bad credentials, network) throws, so it is never
// mistaken for "no such file".
export type FileStorage = {
  save(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<StoredStream | null>;
  remove(key: string): Promise<void>;
};

// Raised when STORAGE_DRIVER=s3 is selected but not fully configured.
export class StorageUnavailableError extends Error {
  constructor() {
    super("Penyimpanan file belum dikonfigurasi.");
    this.name = "StorageUnavailableError";
  }
}

// One directory on local disk: for development and tests, or a single host with a
// mounted volume. It cannot be shared between API replicas.
export function createDiskStorage(root: string): FileStorage {
  const base = resolve(root);

  function pathFor(key: string) {
    const path = resolve(base, checkedKey(key));
    if (!path.startsWith(base + sep)) throw new Error(`Kunci file tidak valid: ${key}`);
    return path;
  }

  return {
    // Written next to its final name and renamed, so a reader never sees half a file.
    async save(key, bytes) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      const staging = `${path}.part`;
      await Bun.write(staging, bytes);
      await rename(staging, path);
    },
    async read(key) {
      const file = Bun.file(pathFor(key));
      if (!(await file.exists())) return null;
      return { stream: file.stream(), size: file.size };
    },
    async remove(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}

type S3Config = Extract<StorageConfig, { driver: "s3" }>;

// An S3-compatible bucket (Cloudflare R2 in production). The bucket must be private:
// files are only ever served by this API, after the access check.
export function createS3Storage(config: S3Config): FileStorage {
  const client = new Bun.S3Client({
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
  });

  async function logged<T>(operation: string, key: string, run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      const { name, code, message } = error as { name?: string; code?: string; message?: string };
      console.error(`Penyimpanan S3 gagal (${operation} ${key}): ${name} ${code ?? ""} ${message}`);
      throw error;
    }
  }

  return {
    async save(key, bytes) {
      const checked = checkedKey(key);
      await logged("save", checked, () =>
        client.file(checked).write(bytes, { type: "application/pdf" }),
      );
    },
    async read(key) {
      const checked = checkedKey(key);
      const file = client.file(checked);
      try {
        const info = await file.stat();
        return { stream: file.stream(), size: info.size };
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "NoSuchKey" || code === "NotFound") {
          // A HEAD request has no body, so a missing *bucket* also arrives as "no such
          // key". Listing tells them apart: it throws NoSuchBucket instead of coming back empty.
          await logged("read", checked, () => client.list({ prefix: checked, maxKeys: 1 }));
          return null;
        }
        return logged("read", checked, () => Promise.reject(error));
      }
    },
    async remove(key) {
      const checked = checkedKey(key);
      await logged("remove", checked, () => client.file(checked).delete());
    },
  };
}

function createUnavailableStorage(problems: string[]): FileStorage {
  console.error(
    `STORAGE_DRIVER=s3 tetapi konfigurasinya belum lengkap (${problems.join("; ")}). ` +
      "Unggah dan unduh file dinonaktifkan sampai itu diperbaiki.",
  );
  const unavailable = () => Promise.reject(new StorageUnavailableError());
  return { save: unavailable, read: unavailable, remove: unavailable };
}

export function createStorage(config: StorageConfig): FileStorage {
  switch (config.driver) {
    case "disk":
      return createDiskStorage(config.uploadDir);
    case "s3":
      return createS3Storage(config);
    case "unconfigured":
      return createUnavailableStorage(config.problems);
  }
}

export const fileStorage = createStorage(env.storage);

// A file that cannot be removed is an orphan (wasted space), not an error worth
// failing the request for: the database row is already the source of truth.
export async function removeQuietly(key: string) {
  try {
    await fileStorage.remove(key);
  } catch (error) {
    console.error(`Gagal menghapus file ${key}:`, error);
  }
}

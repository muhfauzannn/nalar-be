import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Backend-agnostic view of "what is in file storage", for tests that count files.
// Which backend the suite runs against is decided in test/setup.ts.
export const usingS3 = process.env.STORAGE_DRIVER === "s3";

export function testS3Config() {
  return {
    endpoint: process.env.S3_ENDPOINT as string,
    bucket: process.env.S3_BUCKET as string,
    accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    region: process.env.S3_REGION ?? "auto",
  };
}

// Every stored resource key, e.g. "resources/<uuid>.pdf".
export async function storedKeys(): Promise<string[]> {
  if (!usingS3) {
    const dir = join(process.env.UPLOAD_DIR as string, "resources");
    return (await readdir(dir).catch(() => [] as string[])).map((name) => `resources/${name}`);
  }
  const client = new Bun.S3Client(testS3Config());
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.list({ prefix: "resources/", continuationToken });
    keys.push(...(page.contents ?? []).map((entry) => entry.key));
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

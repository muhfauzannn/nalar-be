import { resolve } from "node:path";

const DEFAULT_PORT = 8000;

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optional(source: NodeJS.ProcessEnv, name: string): string | undefined {
  return source[name]?.trim() || undefined;
}

function url(source: NodeJS.ProcessEnv, name: string): URL {
  const value = required(source, name);

  try {
    return new URL(value);
  } catch {
    throw new Error(`Environment variable ${name} must be a valid URL`);
  }
}

function origins(source: NodeJS.ProcessEnv, name: string): string[] {
  const values = required(source, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const parsedOrigins = values.map((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `Environment variable ${name} must contain valid comma-separated URLs`,
      );
    }

    if (
      parsed.origin === "null" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        `Environment variable ${name} must contain exact origins without paths, credentials, query strings, or fragments`,
      );
    }

    return parsed.origin;
  });

  return [...new Set(parsedOrigins)];
}

function port(source: NodeJS.ProcessEnv): number {
  const value = source.PORT;

  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("Environment variable PORT must be an integer from 1 to 65535");
  }

  return parsed;
}

// Where uploaded files live. "s3" is any S3-compatible store (Cloudflare R2 in
// production). A half-filled s3 setup must not take the whole API down, so it is
// reported as "unconfigured": the app boots, uploads/downloads answer 503, and the
// problems are logged at start-up.
export type StorageConfig =
  | { driver: "disk"; uploadDir: string }
  | {
      driver: "s3";
      endpoint: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
    }
  | { driver: "unconfigured"; problems: string[] };

function storage(source: NodeJS.ProcessEnv): StorageConfig {
  const driver = optional(source, "STORAGE_DRIVER") ?? "disk";

  if (driver === "disk") {
    return { driver, uploadDir: resolve(optional(source, "UPLOAD_DIR") ?? "uploads") };
  }
  if (driver !== "s3") {
    throw new Error('Environment variable STORAGE_DRIVER must be "disk" or "s3"');
  }

  const problems: string[] = [];
  const need = (name: string) => {
    const value = optional(source, name);
    if (!value) problems.push(`${name} belum diisi`);
    return value ?? "";
  };
  const endpoint = need("S3_ENDPOINT");
  const bucket = need("S3_BUCKET");
  const accessKeyId = need("S3_ACCESS_KEY_ID");
  const secretAccessKey = need("S3_SECRET_ACCESS_KEY");
  if (endpoint) {
    try {
      new URL(endpoint);
    } catch {
      problems.push("S3_ENDPOINT bukan URL yang valid");
    }
  }
  if (problems.length > 0) return { driver: "unconfigured", problems };

  return {
    driver: "s3",
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    // Cloudflare R2 ignores the region but the signature needs one; "auto" is what it documents.
    region: optional(source, "S3_REGION") ?? "auto",
  };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const betterAuthSecret = required(source, "BETTER_AUTH_SECRET");

  if (betterAuthSecret.length < 32) {
    throw new Error("Environment variable BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  url(source, "BETTER_AUTH_URL");

  const frontendUrl = url(source, "FRONTEND_URL").origin;
  const trustedOrigins = origins(source, "TRUSTED_ORIGIN");

  if (!trustedOrigins.includes(frontendUrl)) {
    throw new Error(
      "Environment variable TRUSTED_ORIGIN must include the FRONTEND_URL origin",
    );
  }

  return {
    databaseUrl: required(source, "DATABASE_URL"),
    frontendUrl,
    geminiApiKey: optional(source, "GEMINI_API_KEY"),
    googleClientId: required(source, "GOOGLE_CLIENT_ID"),
    googleClientSecret: required(source, "GOOGLE_CLIENT_SECRET"),
    port: port(source),
    storage: storage(source),
    trustedOrigins,
  } as const;
}

export type Env = ReturnType<typeof loadEnv>;
export const env = loadEnv();

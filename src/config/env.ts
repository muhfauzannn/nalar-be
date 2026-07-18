const DEFAULT_PORT = 8000;

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function url(source: NodeJS.ProcessEnv, name: string): URL {
  const value = required(source, name);

  try {
    return new URL(value);
  } catch {
    throw new Error(`Environment variable ${name} must be a valid URL`);
  }
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

function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const betterAuthSecret = required(source, "BETTER_AUTH_SECRET");

  if (betterAuthSecret.length < 32) {
    throw new Error("Environment variable BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  url(source, "BETTER_AUTH_URL");

  return {
    databaseUrl: required(source, "DATABASE_URL"),
    frontendUrl: url(source, "FRONTEND_URL").origin,
    googleClientId: required(source, "GOOGLE_CLIENT_ID"),
    googleClientSecret: required(source, "GOOGLE_CLIENT_SECRET"),
    port: port(source),
  } as const;
}

export type Env = ReturnType<typeof loadEnv>;
export const env = loadEnv();

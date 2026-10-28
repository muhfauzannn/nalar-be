// One JSON object per line on stdout/stderr, so `docker logs` / Dokploy log views can be
// grepped (`"event":"tutor_session_mint_failed"`) without a log pipeline. Never pass secrets in.
export type LogLevel = "info" | "warn" | "error";
export type LogSink = (level: LogLevel, line: string) => void;

const consoleSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

// bun test sets NODE_ENV=test: keep the suite quiet unless a test installs its own sink.
let sink: LogSink = process.env.NODE_ENV === "test" ? () => {} : consoleSink;

export function setLogSink(next: LogSink | null) {
  sink = next ?? (process.env.NODE_ENV === "test" ? () => {} : consoleSink);
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  sink(level, JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
}

// Provider errors and browser-reported close reasons are free text. Strip anything that looks
// like a credential before it reaches a log line, and keep the line short.
const SECRET_PATTERNS = [/AIza[0-9A-Za-z_-]{20,}/g, /auth_tokens\/[^\s"'\\]+/g, /sk-[0-9A-Za-z_-]{20,}/g];

export function redact(text: string) {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, "[redacted]"), text);
}

export function describeError(error: unknown, maxLength = 300) {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return redact(raw).replace(/\s+/g, " ").slice(0, maxLength);
}

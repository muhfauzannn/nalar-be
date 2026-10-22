import { openaiRequest } from "../../lib/openai";

export async function mintTutorToken(apiKey: string, session: Record<string, unknown>, userId: string) {
  const result = await openaiRequest<{ value: string; expires_at: number }>(apiKey, "realtime/client_secrets", {
    expires_after: { anchor: "created_at", seconds: 60 }, session,
  }, userId);
  if (!result.value || !Number.isFinite(result.expires_at)) throw new Error("Empty tutor credential");
  return {
    token: result.value,
    // Credential TTL controls connecting, not an established session's lifetime.
    tokenExpiresAt: new Date(result.expires_at * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 55 * 60_000).toISOString(),
  };
}

/** Server-only transport. Never return upstream headers or credentials. */
export async function openaiRequest<T>(apiKey: string, path: string, body: unknown, safetyIdentifier?: string): Promise<T> {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(safetyIdentifier ? { "OpenAI-Safety-Identifier": safetyIdentifier } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  return await response.json() as T;
}

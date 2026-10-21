/** Optional paid provider smoke test. Uses a synthetic lesson, never the database. */
import { readFile } from "node:fs/promises";
import { GoogleGenAI, type Session } from "@google/genai";
import { PDF_TUTOR_MODEL, pdfTutorConfig } from "../modules/ai-tutor/pdf-tutor.config";

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) throw new Error("GEMINI_API_KEY wajib diisi untuk smoke test provider.");
const imagePath = process.env.PDF_TUTOR_SMOKE_IMAGE;
const image = imagePath ? (await readFile(imagePath)).toString("base64") : null;
let credential = "";
let session: Session | null = null;
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  const client = new GoogleGenAI({ apiKey });
  const token = await client.authTokens.create({ config: {
    uses: 1, expireTime: new Date(Date.now() + 120_000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
    httpOptions: { apiVersion: "v1alpha" },
    liveConnectConstraints: { model: PDF_TUTOR_MODEL, config: pdfTutorConfig("smoke-pdf", "Pecahan.pdf") },
  } });
  if (!token.name) throw new Error("Provider tidak mengembalikan token.");
  credential = token.name;
  const ephemeral = new GoogleGenAI({ apiKey: credential, httpOptions: { apiVersion: "v1alpha" } });
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const result = { tokenMinted: true, connected: false, contextRead: false, validGuidance: false, audioReceived: false, imageSent: !!image };
  const context = {
    resourceId: "smoke-pdf", page: 1, totalPages: 1, revision: 1, turnId: "smoke-turn",
    viewport: { x: 0, y: 0, width: 1, height: 1 },
    selection: image ? { text: "Diagram pembagian pada gambar halaman", x: 0.09, y: 0.31, width: 0.6, height: 0.13 }
      : { text: "Pembilang menunjukkan bagian yang dipilih.", x: 0.1, y: 0.2, width: 0.6, height: 0.05 },
    blocks: image ? [] : [{ id: "p1-b1", text: "Pembilang menunjukkan bagian yang dipilih.", x: 0.1, y: 0.2, width: 0.6, height: 0.05 }],
    imageAvailable: !!image,
  };
  session = await ephemeral.live.connect({ model: PDF_TUTOR_MODEL, config: {}, callbacks: {
    onmessage: (message) => {
      if (!session) return;
      for (const call of message.toolCall?.functionCalls ?? []) {
        let response: Record<string, unknown>;
        if (call.name === "get_pdf_context") {
          result.contextRead = true;
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: `PDF_VIEW_STATE ${JSON.stringify(context)}` }] }], turnComplete: false });
          if (image) session.sendRealtimeInput({ video: { data: image, mimeType: "image/jpeg" } });
          response = context;
        } else {
          const args = call.args;
          const valid = call.name === "present_pdf_guidance" && args?.resourceId === context.resourceId && args?.page === context.page && args?.revision === context.revision && args?.turnId === context.turnId && Array.isArray(args?.actions) && args.actions.length > 0;
          result.validGuidance ||= valid;
          response = { ok: valid };
        }
        session.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response }] });
      }
      if (message.serverContent?.modelTurn?.parts?.some((part) => part.inlineData?.mimeType?.startsWith("audio/"))) result.audioReceived = true;
      if (message.serverContent?.turnComplete && result.audioReceived) resolveDone();
    },
    onerror: () => resolveDone(), onclose: () => resolveDone(),
  } });
  result.connected = true;
  if (image) session.sendRealtimeInput({ video: { data: image, mimeType: "image/jpeg" } });
  session.sendClientContent({ turns: [{ role: "user", parts: [{ text: image ? "Jelaskan diagram pecahan yang dipilih pada gambar halaman sambil melingkari bagian yang dibahas. Cukup dua kalimat." : "Jelaskan pembilang yang dipilih sambil menunjukkannya. Cukup dua kalimat." }] }], turnComplete: true });
  await Promise.race([done, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 30_000); })]);
  console.log(JSON.stringify(result));
  if (!result.contextRead || !result.validGuidance || !result.audioReceived) process.exitCode = 1;
} catch (error) {
  const message = String((error as Error).message).replaceAll(apiKey, "[redacted]").replaceAll(credential || "___", "[redacted]");
  console.error(message.slice(0, 1200));
  process.exitCode = 1;
} finally {
  if (timeout) clearTimeout(timeout);
  session?.close();
}

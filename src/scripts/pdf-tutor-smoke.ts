/** Explicit paid provider check using synthetic materials, never the database. */
import { readFile } from "node:fs/promises";
import { pdfTutorConfig, PDF_TUTOR_MODEL } from "../modules/ai-tutor/pdf-tutor.config";
import { assessmentTutorConfig } from "../modules/ai-tutor/live-tutor.config";
import { mintTutorToken } from "../modules/ai-tutor/openai-session";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY wajib diisi untuk smoke test provider.");
const assessment = process.env.TUTOR_SMOKE_MODE === "assessment";
const imagePath = process.env.PDF_TUTOR_SMOKE_IMAGE;
const image = imagePath ? (await readFile(imagePath)).toString("base64") : null;
const context = {
  resourceId: "smoke-pdf", page: 1, totalPages: 1, revision: 1, turnId: "smoke-turn",
  viewport: { x: 0, y: 0, width: 1, height: 1 },
  selection: { text: "Pembilang menunjukkan bagian yang dipilih.", x: 0.1, y: 0.2, width: 0.6, height: 0.05 },
  blocks: [{ id: "p1-b1", text: "Pembilang menunjukkan bagian yang dipilih.", x: 0.1, y: 0.2, width: 0.6, height: 0.05 }],
  imageAvailable: !!image,
};
let socket: WebSocket | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let credential = "";
try {
  const config = assessment
    ? assessmentTutorConfig("Kamu tutor matematika bahasa Indonesia. Wajib classify_student_prompt pada setiap pertanyaan sebelum menjawab dan ikuti responseInstruction dari hasilnya. Jangan beri jawaban akhir kuis. Beri satu petunjuk singkat.")
    : pdfTutorConfig(context.resourceId, "Pecahan.pdf");
  const token = await mintTutorToken(apiKey, config, "bernalar-synthetic-smoke");
  credential = token.token;
  const result = { model: PDF_TUTOR_MODEL, mode: assessment ? "assessment" : "pdf", tokenMinted: true,
    connected: false, configurationRetained: false, contextRead: false, validGuidance: false,
    classified: false, audioReceived: false, audioBeforeGuardrail: false, firstAudioMs: null as number | null };
  let sentAt = 0;
  await new Promise<void>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Provider smoke timed out")), 40_000);
    socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${PDF_TUTOR_MODEL}`, ["realtime", `openai-insecure-api-key.${credential}`]);
    const send = (event: Record<string, unknown>) => socket!.send(JSON.stringify(event));
    socket.onmessage = (message) => {
      const event = JSON.parse(String(message.data));
      if (event.type === "session.created") {
        result.connected = true;
        result.configurationRetained = event.session.instructions === config.instructions && event.session.tools?.length === config.tools.length;
        if (!result.configurationRetained) { reject(new Error("Ephemeral session lost tutor configuration")); return; }
        if (image) send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_image", image_url: `data:image/jpeg;base64,${image}` }] } });
        sentAt = performance.now();
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: assessment ? "Bagaimana cara menjumlahkan pecahan berbeda penyebut?" : "Jelaskan pembilang yang dipilih sambil menunjukkannya. Cukup dua kalimat." }] } });
        send({ type: "response.create" });
      }
      if (event.type === "error") reject(new Error(`Provider error: ${event.error?.code ?? "unknown"}`));
      if (event.type === "response.output_audio.delta") {
        result.audioReceived = true;
        result.audioBeforeGuardrail ||= !(assessment ? result.classified : result.contextRead && result.validGuidance);
        result.firstAudioMs ??= Math.round(performance.now() - sentAt);
      }
      if (event.type === "response.done") {
        if (event.response.status === "failed") { reject(new Error(`Provider response failed: ${event.response.status_details?.error?.code}`)); return; }
        const calls = event.response.output.filter((item: { type: string }) => item.type === "function_call");
        for (const call of calls) {
          let output: Record<string, unknown> = { ok: false };
          const args = JSON.parse(call.arguments);
          if (call.name === "classify_student_prompt") {
            result.classified = typeof args.content === "string" && !!args.content.trim();
            output = { intent: "explanation_hint", wasRedirected: false, responseInstruction: "Beri satu petunjuk singkat untuk mencari penyebut yang sama, tanpa jawaban akhir." };
          } else if (call.name === "get_pdf_context") { result.contextRead = true; output = context; }
          else if (call.name === "present_pdf_guidance") {
            result.validGuidance = args.resourceId === context.resourceId && args.page === 1 && args.revision === 1 && args.turnId === context.turnId && args.actions?.length > 0;
            output = { ok: result.validGuidance };
          }
          send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) } });
        }
        if (calls.length) send({ type: "response.create", response: { tool_choice: "auto" } });
        else if (result.audioReceived) resolve();
      }
    };
    socket.onerror = () => reject(new Error("Provider socket failed"));
    socket.onclose = () => resolve();
  });
  console.log(JSON.stringify(result));
  if (!result.audioReceived || result.audioBeforeGuardrail || (assessment ? !result.classified : !result.contextRead || !result.validGuidance)) process.exitCode = 1;
} catch (error) {
  console.error(String((error as Error).message).replaceAll(apiKey, "[redacted]").replaceAll(credential || "___", "[redacted]").slice(0, 500));
  process.exitCode = 1;
} finally {
  if (timeout) clearTimeout(timeout);
  socket?.close();
}

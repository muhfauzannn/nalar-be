import { mintTutorToken } from "./openai-session";
import { env } from "../../config/env";
import { getStudentResourceFile } from "../student/student.service";
import { AiTutorServiceError, tutorSessionLimiter } from "./ai-tutor.service";
import { PDF_TUTOR_MODEL, pdfTutorConfig } from "./pdf-tutor.config";
import type { TutorAudioFormat } from "./live-tutor.config";

export async function createPdfTutorSession(userId: string, resourceId: string, audioFormat: TutorAudioFormat = "pcm") {
  const limit = tutorSessionLimiter.check(userId);
  if (!limit.allowed) {
    throw new AiTutorServiceError(429, "Terlalu banyak sesi tutor. Coba lagi beberapa menit lagi.", "AI_TUTOR_RATE_LIMITED");
  }
  tutorSessionLimiter.record(userId);
  // Apply exactly the same enrollment/publication checks as downloading the PDF.
  // Never trust a client-supplied title, URL, or lesson context.
  const file = await getStudentResourceFile(userId, resourceId);
  if (!env.openaiApiKey) {
    throw new AiTutorServiceError(503, "AI Tutor belum dikonfigurasi pada server.", "AI_TUTOR_UNAVAILABLE");
  }
  try {
    const credential = await mintTutorToken(env.openaiApiKey, pdfTutorConfig(resourceId, file.name, audioFormat), userId);
    return { ...credential, model: PDF_TUTOR_MODEL, resourceId, audioFormat };
  } catch {
    throw new AiTutorServiceError(503, "Tutor suara belum dapat disambungkan. Silakan coba lagi.", "AI_TUTOR_SESSION_FAILED");
  }
}

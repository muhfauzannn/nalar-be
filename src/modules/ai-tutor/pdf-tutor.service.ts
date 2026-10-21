import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env";
import { getStudentResourceFile } from "../student/student.service";
import { AiTutorServiceError, tutorSessionLimiter } from "./ai-tutor.service";
import { PDF_TUTOR_MODEL, pdfTutorConfig } from "./pdf-tutor.config";

export async function createPdfTutorSession(userId: string, resourceId: string) {
  const limit = tutorSessionLimiter.check(userId);
  if (!limit.allowed) {
    throw new AiTutorServiceError(429, "Terlalu banyak sesi tutor. Coba lagi beberapa menit lagi.", "AI_TUTOR_RATE_LIMITED");
  }
  tutorSessionLimiter.record(userId);
  // Apply exactly the same enrollment/publication checks as downloading the PDF.
  // Never trust a client-supplied title, URL, or lesson context.
  const file = await getStudentResourceFile(userId, resourceId);
  if (!env.geminiApiKey) {
    throw new AiTutorServiceError(503, "AI Tutor belum dikonfigurasi pada server.", "AI_TUTOR_UNAVAILABLE");
  }
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  try {
    const client = new GoogleGenAI({ apiKey: env.geminiApiKey });
    const token = await client.authTokens.create({ config: {
      uses: 1, expireTime: expiresAt,
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      httpOptions: { apiVersion: "v1alpha" },
      liveConnectConstraints: { model: PDF_TUTOR_MODEL, config: pdfTutorConfig(resourceId, file.name) },
    } });
    if (!token.name) throw new Error("Empty live token");
    return { token: token.name, model: PDF_TUTOR_MODEL, expiresAt, resourceId };
  } catch {
    throw new AiTutorServiceError(503, "Tutor suara belum dapat disambungkan. Silakan coba lagi.", "AI_TUTOR_SESSION_FAILED");
  }
}

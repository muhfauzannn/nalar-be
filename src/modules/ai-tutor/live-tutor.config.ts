import {
  ActivityHandling,
  Behavior,
  EndSensitivity,
  Modality,
  StartSensitivity,
  TurnCoverage,
  type LiveConnectConfig,
} from "@google/genai";

export const GEMINI_LIVE_MODEL = "gemini-3.8-live";
export const TUTOR_SILENCE_DURATION_MS = 500;

export function assessmentTutorConfig(systemInstruction: string): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    temperature: 0.35,
    maxOutputTokens: 700,
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
    },
    // Gemini 3.8 Live does not accept thinkingConfig. Language is set in the prompt.
    realtimeInputConfig: {
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: TUTOR_SILENCE_DURATION_MS,
      },
    },
    contextWindowCompression: {
      triggerTokens: "12000",
      slidingWindow: { targetTokens: "8000" },
    },
    systemInstruction,
    tools: [{
      functionDeclarations: [{
        name: "classify_student_prompt",
        // 3.8 defaults to non-blocking; classification must finish before any reply.
        behavior: Behavior.BLOCKING,
        description: "Wajib dipanggil sebelum merespons setiap giliran siswa, baik teks maupun suara. Kirim pesan atau transkrip siswa apa adanya agar backend menentukan guardrail respons.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            content: { type: "string", description: "Transkrip lengkap ucapan siswa pada giliran ini." },
          },
          required: ["content"],
        },
      }],
    }],
  };
}

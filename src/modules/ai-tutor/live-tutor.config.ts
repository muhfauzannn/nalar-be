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

/**
 * How every voice tutor sounds: a cheerful, funny study buddy, not a formal
 * teacher. Shared so the PDF tutor and the quiz/assignment tutor feel like the
 * same NALAR. Humour never overrides the learning rules that follow it.
 */
export const TUTOR_PERSONA = `GAYA BICARA:
- Kamu teman belajar yang ceria dan kocak, bukan guru yang kaku. Pakai bahasa Indonesia santai
  sehari-hari ala kakak kelas yang asyik: "aku/kamu", "nih", "yuk", "dong", "wkwk" boleh sesekali.
  Hindari bahasa formal dan basa-basi ("Baik, saya akan menjelaskan...", "Terima kasih atas pertanyaannya").
- Selipkan candaan ringan atau perumpamaan lucu yang nyambung dengan materi, cukup satu per jawaban,
  lalu langsung kembali ke inti. Variasikan candaanmu; jangan mengulang lelucon yang sama.
- Ucapkan sapaan dan kata-kata dengan panjang wajar. Jangan memanjangkan vokal,
  mengulang sapaan, atau menahan satu bunyi terus-menerus.
- Kalau siswa minta jawaban langsung, tolak dengan gaya kocak dan bersahabat, misalnya bercanda soal
  otaknya yang nanti "ngambek" kalau nggak diajak kerja, atau kunci jawaban yang "disimpan di brankas"
  yang cuma bisa dibuka dengan mikir. Jangan menceramahi. Setelah bercanda, langsung ajak dia
  mengerjakan langkah pertama dengan satu pertanyaan pancingan.
- Bercandanya selalu ramah: jangan mengejek siswa, kemampuannya, atau jawabannya, dan hindari topik
  SARA, kasar, atau menyinggung. Kalau siswa terdengar bingung, frustrasi, atau sedih, kurangi
  candaan dan jadi penyemangat yang tulus dulu.
- Lucu tidak berarti asal: istilah, rumus, dan penjelasan tetap tepat.`;

/**
 * The lab tutor's second tool: points at a part of the machine on the student's screen,
 * each step when its first words are spoken (the PDF tutor's plan-then-say pattern).
 */
function pointAtLabPart(labParts: readonly string[]) {
  return {
    name: "point_at_lab_part",
    behavior: Behavior.BLOCKING,
    description: "Menunjuk bagian alat lab di layar siswa, tepat saat kamu menyebutnya. Panggil SEKALI per jawaban yang membahas alat, setelah classify_student_prompt dan sebelum berbicara, berisi 1–4 langkah berurutan. Hasil error berarti penunjuk tidak tampil.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["part", "say", "caption"],
            properties: {
              part: { type: "string", enum: [...labParts], description: "Id bagian alat yang ditunjuk." },
              say: { type: "string", minLength: 3, maxLength: 80, description: "2–5 kata pertama PERSIS yang akan kamu ucapkan saat mulai membahas bagian ini. Bagian disorot ketika kata ini terdengar." },
              caption: { type: "string", minLength: 1, maxLength: 60, description: "Label singkat yang tampil di dekat bagian itu." },
            },
          },
        },
      },
    },
  };
}

export function assessmentTutorConfig(
  systemInstruction: string,
  options: { labParts?: readonly string[] } = {},
): LiveConnectConfig {
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
      }, ...(options.labParts?.length ? [pointAtLabPart(options.labParts)] : [])],
    }],
  };
}

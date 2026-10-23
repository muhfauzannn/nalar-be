export const OPENAI_LIVE_MODEL = "gpt-realtime-2.1";
export const TUTOR_SILENCE_DURATION_MS = 500;

/**
 * Wire format for both audio directions. "pcmu" (G.711 mu-law, 8 kHz) is ~6x smaller than
 * 24 kHz PCM; on a mobile uplink PCM's ~512 kbps backs up the socket and answers arrive seconds
 * late. Clients ask for it; anything else (older clients) keeps PCM.
 */
export type TutorAudioFormat = "pcm" | "pcmu";
export function tutorAudioFormat(value: unknown): TutorAudioFormat {
  return value === "pcmu" ? "pcmu" : "pcm";
}
const AUDIO_FORMATS = {
  pcm: { type: "audio/pcm", rate: 24_000 },
  pcmu: { type: "audio/pcmu" },
} as const;

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
- Kalau siswa minta jawaban langsung, tolak dengan gaya kocak dan bersahabat, misalnya bercanda soal
  otaknya yang nanti "ngambek" kalau nggak diajak kerja, atau kunci jawaban yang "disimpan di brankas"
  yang cuma bisa dibuka dengan mikir. Jangan menceramahi. Setelah bercanda, langsung ajak dia
  mengerjakan langkah pertama dengan satu pertanyaan pancingan.
- Bercandanya selalu ramah: jangan mengejek siswa, kemampuannya, atau jawabannya, dan hindari topik
  SARA, kasar, atau menyinggung. Kalau siswa terdengar bingung, frustrasi, atau sedih, kurangi
  candaan dan jadi penyemangat yang tulus dulu.
- Lucu tidak berarti asal: istilah, rumus, dan penjelasan tetap tepat.`;

export type TutorTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function liveTutorConfig(instructions: string, tools: TutorTool[], maxOutputTokens = 700, audioFormat: TutorAudioFormat = "pcm") {
  return {
    type: "realtime" as const,
    model: OPENAI_LIVE_MODEL,
    instructions,
    output_modalities: ["audio"],
    max_output_tokens: maxOutputTokens,
    audio: {
      input: {
        format: AUDIO_FORMATS[audioFormat],
        transcription: { model: "gpt-4o-mini-transcribe", language: "id" },
        noise_reduction: { type: "near_field" },
        turn_detection: {
          type: "server_vad", threshold: 0.5, prefix_padding_ms: 150,
          silence_duration_ms: TUTOR_SILENCE_DURATION_MS,
          create_response: true, interrupt_response: true,
        },
      },
      output: { format: AUDIO_FORMATS[audioFormat], voice: "marin" },
    },
    tools,
    // Force the guardrail/context tool on each new student turn. Tool continuations
    // explicitly use auto so the model can explain after receiving its result.
    tool_choice: { type: "function", name: tools[0]!.name },
    truncation: { type: "retention_ratio", retention_ratio: 0.8 },
  };
}

export function assessmentTutorConfig(systemInstruction: string, audioFormat: TutorAudioFormat = "pcm") {
  return liveTutorConfig(systemInstruction, [{
    type: "function",
    name: "classify_student_prompt",
    description: "Wajib dipanggil sebelum merespons setiap giliran siswa, baik teks maupun suara. Kirim pesan atau transkrip siswa apa adanya agar backend menentukan guardrail respons. Tunggu hasil tool sebelum berbicara.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { content: { type: "string", description: "Transkrip lengkap ucapan siswa pada giliran ini." } },
      required: ["content"],
    },
  }], undefined, audioFormat);
}

export const OPENAI_LIVE_MODEL = "gpt-realtime-2.1";
export const TUTOR_SILENCE_DURATION_MS = 500;

export type TutorTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function liveTutorConfig(instructions: string, tools: TutorTool[], maxOutputTokens = 700) {
  return {
    type: "realtime" as const,
    model: OPENAI_LIVE_MODEL,
    instructions,
    output_modalities: ["audio"],
    max_output_tokens: maxOutputTokens,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24_000 },
        transcription: { model: "gpt-4o-mini-transcribe", language: "id" },
        noise_reduction: { type: "near_field" },
        turn_detection: {
          type: "server_vad", threshold: 0.5, prefix_padding_ms: 150,
          silence_duration_ms: TUTOR_SILENCE_DURATION_MS,
          create_response: true, interrupt_response: true,
        },
      },
      output: { format: { type: "audio/pcm", rate: 24_000 }, voice: "marin" },
    },
    tools,
    // Force the guardrail/context tool on each new student turn. Tool continuations
    // explicitly use auto so the model can explain after receiving its result.
    tool_choice: { type: "function", name: tools[0]!.name },
    truncation: { type: "retention_ratio", retention_ratio: 0.8 },
  };
}

export function assessmentTutorConfig(systemInstruction: string) {
  return liveTutorConfig(systemInstruction, [{
    type: "function",
    name: "classify_student_prompt",
    description: "Wajib dipanggil sebelum merespons setiap giliran siswa, baik teks maupun suara. Kirim pesan atau transkrip siswa apa adanya agar backend menentukan guardrail respons. Tunggu hasil tool sebelum berbicara.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { content: { type: "string", description: "Transkrip lengkap ucapan siswa pada giliran ini." } },
      required: ["content"],
    },
  }]);
}

import { expect, test } from "bun:test";
import { assessmentTutorConfig, OPENAI_LIVE_MODEL, tutorAudioFormat } from "../src/modules/ai-tutor/live-tutor.config";
import { pdfTutorConfig } from "../src/modules/ai-tutor/pdf-tutor.config";

test("OpenAI assessment sessions preserve classification, Indonesian transcription and PCM audio", () => {
  const instruction = "Gunakan Bahasa Indonesia. Periksa pesan siswa sebelum menjawab.";
  const config = assessmentTutorConfig(instruction);
  expect(OPENAI_LIVE_MODEL).toBe("gpt-realtime-2.1");
  expect(config.instructions).toBe(instruction);
  expect(config.audio.input.transcription.language).toBe("id");
  expect(config.audio.input.turn_detection.silence_duration_ms).toBe(500);
  expect(config.audio.output.format).toEqual({ type: "audio/pcm", rate: 24000 });
  expect(config.tools).toHaveLength(1);
  expect(config.tools[0]).toMatchObject({ type: "function", name: "classify_student_prompt" });
  expect(config.tools[0]?.parameters).toMatchObject({ additionalProperties: false, required: ["content"] });
});

test("clients that ask for G.711 get mu-law both ways; anything else keeps 24 kHz PCM", () => {
  const config = assessmentTutorConfig("x", tutorAudioFormat("pcmu"));
  expect(config.audio.input.format).toEqual({ type: "audio/pcmu" });
  expect(config.audio.output.format).toEqual({ type: "audio/pcmu" });
  expect(config.tools[0]).toMatchObject({ name: "classify_student_prompt" });
  for (const value of [undefined, "pcm", "opus", 1]) {
    expect(assessmentTutorConfig("x", tutorAudioFormat(value)).audio.input.format).toEqual({ type: "audio/pcm", rate: 24000 });
  }
  const pdf = pdfTutorConfig("resource-a", "materi.pdf", "pcmu");
  expect(pdf.audio.output.format).toEqual({ type: "audio/pcmu" });
  expect(pdf.max_output_tokens).toBe(1000);
});

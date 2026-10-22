import { expect, test } from "bun:test";
import { assessmentTutorConfig, OPENAI_LIVE_MODEL } from "../src/modules/ai-tutor/live-tutor.config";

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

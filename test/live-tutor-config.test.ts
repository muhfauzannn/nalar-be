import { expect, test } from "bun:test";
import { assessmentTutorConfig, GEMINI_LIVE_MODEL } from "../src/modules/ai-tutor/live-tutor.config";

test("Gemini 3.8 assessment sessions wait for classification and omit unsupported setup fields", () => {
  const instruction = "Gunakan Bahasa Indonesia. Periksa pesan siswa sebelum menjawab.";
  const config = assessmentTutorConfig(instruction);
  expect(GEMINI_LIVE_MODEL).toBe("gemini-3.8-live");
  expect(config.systemInstruction).toBe(instruction);
  expect(config.thinkingConfig).toBeUndefined();
  expect(config.speechConfig?.languageCode).toBeUndefined();
  expect(config.realtimeInputConfig?.automaticActivityDetection?.silenceDurationMs).toBe(500);
  const functions = config.tools?.flatMap((tool) => "functionDeclarations" in tool ? tool.functionDeclarations ?? [] : []);
  expect(functions).toHaveLength(1);
  expect(functions?.[0]).toMatchObject({ name: "classify_student_prompt", behavior: "BLOCKING" });
});

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

const declared = (config: ReturnType<typeof assessmentTutorConfig>) =>
  config.tools?.flatMap((tool) => "functionDeclarations" in tool ? tool.functionDeclarations ?? [] : []) ?? [];

test("a lab tutor can also point at the machine, only at the parts of that lab", () => {
  const functions = declared(assessmentTutorConfig("Gunakan Bahasa Indonesia.", { labParts: ["engkol", "pasak"] }));
  expect(functions.map((declaration) => declaration.name)).toEqual(["classify_student_prompt", "point_at_lab_part"]);
  const point = functions[1]!;
  expect(point).toMatchObject({ behavior: "BLOCKING" });
  const steps = (point.parametersJsonSchema as any).properties.steps;
  expect(steps.maxItems).toBe(4);
  expect(steps.items.properties.part.enum).toEqual(["engkol", "pasak"]);
  // Like the PDF tutor, every step says which words it belongs to, so it is shown as they are spoken.
  expect(steps.items.required).toEqual(["part", "say", "caption"]);
});

test("the other tutors have nothing to point at", () => {
  expect(declared(assessmentTutorConfig("Gunakan Bahasa Indonesia."))).toHaveLength(1);
  expect(declared(assessmentTutorConfig("Gunakan Bahasa Indonesia.", { labParts: [] }))).toHaveLength(1);
});

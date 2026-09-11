import { describe, expect, it } from "vitest";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, expectedTotalLatencyMs, runPipelineToCMM } from "../src/synthetic/index.js";
import { validatePipeline } from "../src/model/validate.js";

describe("Synthetic Pipeline Test Harness", () => {
  it.each(SYNTHETIC_FIXTURES)("computes the documented expected total latency for '$id'", async (spec) => {
    const adapter = new SyntheticAdapter(spec);
    const pipeline = await runPipelineToCMM(adapter, spec.name);
    expect(pipeline.totalLatencyMeasurement?.value).toBeCloseTo(expectedTotalLatencyMs(spec), 6);
    expect(pipeline.stages).toHaveLength(spec.stages.length);
  });

  it("produces CMM-schema-valid output for every fixture", async () => {
    for (const spec of SYNTHETIC_FIXTURES) {
      const adapter = new SyntheticAdapter(spec);
      const pipeline = await runPipelineToCMM(adapter, spec.name);
      const result = validatePipeline(pipeline);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("the camera-to-display fixture matches the roadmap's worked example (38ms)", async () => {
    const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "camera-to-display")!;
    const adapter = new SyntheticAdapter(spec);
    const pipeline = await runPipelineToCMM(adapter, spec.name);
    expect(pipeline.totalLatencyMeasurement?.value).toBe(38);
  });

  it("detects a corrupted/tampered pipeline as a negative-test sanity check", async () => {
    const spec = SYNTHETIC_FIXTURES[0]!;
    const adapter = new SyntheticAdapter(spec);
    const pipeline = await runPipelineToCMM(adapter, spec.name);
    const corrupted = { ...pipeline, stages: [{ id: "x", name: "x", measurements: [{ id: "bad" }] }] };
    const result = validatePipeline(corrupted);
    expect(result.valid).toBe(false);
  });
});

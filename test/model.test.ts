import { describe, expect, it } from "vitest";
import { validatePipeline } from "../src/model/validate.js";
import type { Pipeline } from "../src/model/types.js";

const validPipeline: Pipeline = {
  schemaVersion: "0.1.0",
  id: "pipeline-1",
  name: "camera-to-display",
  generatedAt: new Date().toISOString(),
  stages: [
    {
      id: "capture",
      name: "capture",
      measurements: [
        {
          id: "m1",
          name: "latency_ms",
          value: 8.2,
          unit: "ms",
          provenance: { kind: "measured", method: "timestamp", confidence: "high" }
        }
      ]
    }
  ],
  totalLatencyMeasurement: {
    id: "m2",
    name: "total_latency_ms",
    value: 8.2,
    unit: "ms",
    provenance: { kind: "derived", method: "timestamp", confidence: "high", sourceIds: ["m1"] }
  }
};

describe("Common Measurement Model schema", () => {
  it("validates a well-formed pipeline", () => {
    const result = validatePipeline(validPipeline);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a measurement missing provenance", () => {
    const invalid = {
      ...validPipeline,
      stages: [
        {
          id: "capture",
          name: "capture",
          measurements: [{ id: "m1", name: "latency_ms", value: 8.2, unit: "ms" }]
        }
      ]
    };
    const result = validatePipeline(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects an unknown confidence level", () => {
    const invalid = {
      ...validPipeline,
      stages: [
        {
          id: "capture",
          name: "capture",
          measurements: [
            {
              id: "m1",
              name: "latency_ms",
              value: 8.2,
              unit: "ms",
              provenance: { kind: "measured", method: "timestamp", confidence: "certain" }
            }
          ]
        }
      ]
    };
    const result = validatePipeline(invalid);
    expect(result.valid).toBe(false);
  });

  it("rejects a payload missing required top-level fields", () => {
    const result = validatePipeline({ name: "incomplete" });
    expect(result.valid).toBe(false);
  });
});

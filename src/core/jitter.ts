import type { Measurement } from "../model/types.js";
import { nextId } from "./ids.js";

/** Sample standard deviation, ms. Requires >= 2 samples; returns 0 for fewer. */
export function computeJitterMs(samplesMs: readonly number[]): number {
  if (samplesMs.length < 2) return 0;
  const mean = samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length;
  const variance = samplesMs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (samplesMs.length - 1);
  return Math.sqrt(variance);
}

export function jitterMeasurement(samplesMs: readonly number[], sourceIds: readonly string[] = []): Measurement {
  return {
    id: nextId("measurement"),
    name: "jitter_ms",
    value: computeJitterMs(samplesMs),
    unit: "ms",
    provenance: { kind: "derived", method: "timestamp", confidence: samplesMs.length >= 2 ? "high" : "low", sourceIds }
  };
}

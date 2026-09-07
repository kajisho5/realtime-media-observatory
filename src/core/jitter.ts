import { deriveProvenance } from "../model/provenance.js";
import type { Measurement } from "../model/types.js";
import { nextId } from "./ids.js";

/** Sample standard deviation, ms. Requires >= 2 samples; returns 0 for fewer. */
export function computeJitterMs(samplesMs: readonly number[]): number {
  if (samplesMs.length < 2) return 0;
  const mean = samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length;
  const variance = samplesMs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (samplesMs.length - 1);
  return Math.sqrt(variance);
}

export function jitterMeasurement(sources: readonly Measurement[]): Measurement {
  // Jitter's own confidence reflects statistical sample size, not the
  // confidence of its inputs' values — a jitter computed from too few
  // samples is low-confidence even if every sample was itself high-confidence.
  const statisticalConfidence = sources.length >= 2 ? "high" : "low";
  return {
    id: nextId("measurement"),
    name: "jitter_ms",
    value: computeJitterMs(sources.map((m) => m.value)),
    unit: "ms",
    provenance: deriveProvenance("derived", "timestamp", sources, statisticalConfidence)
  };
}

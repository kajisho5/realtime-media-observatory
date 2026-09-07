/**
 * Self-benchmark for the Instrumentation Core's own recording path. The
 * observer must not become the bottleneck it's trying to measure — this
 * produces a Measurement stating how much overhead a single stage
 * start/end round-trip costs, so that overhead can be reported and
 * tracked rather than assumed negligible.
 */
import { measuredProvenance } from "../model/provenance.js";
import type { Measurement } from "../model/types.js";
import { nextId } from "./ids.js";
import { StageRecorder } from "./stage.js";

const BENCH_CLOCK = { domain: "monotonic", id: "core-overhead-benchmark" } as const;

/** Runs `iterations` start/end round-trips through StageRecorder and reports the average wall-clock cost per call. */
export function measureCoreOverheadMs(iterations = 10_000): Measurement {
  const recorder = new StageRecorder();
  const startedAt = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const stageId = `bench-${i}`;
    recorder.start(stageId, { clock: BENCH_CLOCK, valueMs: 0 });
    recorder.end(stageId, { clock: BENCH_CLOCK, valueMs: 0 });
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    id: nextId("measurement"),
    name: "core_overhead_ms_per_call",
    value: elapsedMs / iterations,
    unit: "ms",
    provenance: measuredProvenance("timestamp")
  };
}

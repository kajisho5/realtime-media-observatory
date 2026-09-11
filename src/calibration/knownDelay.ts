/**
 * Measurement Calibration: known-delay reference method.
 *
 * Validates that the Instrumentation Core computes latency correctly by
 * running a pipeline whose stage timing is precisely known (the Synthetic
 * Pipeline Test Harness, #5) and comparing the Core's computed total
 * latency against that known value.
 *
 * Scope note: this validates the Core's *arithmetic* — that stage timing
 * fed in comes back out correctly summed — not real-world measurement
 * accuracy against physical hardware. The Synthetic Harness injects exact
 * timestamps rather than measuring real delays, so this calibration's
 * error bound reflects floating-point/computation error only. Real-world
 * accuracy (camera/audio/display timing) is the job of Real Hardware
 * Validation (see docs/architecture/calibration.md and roadmap issue #15),
 * which this module's `toleranceMs` is designed to accommodate once a
 * hardware-backed loopback reference is wired in as a second calibration
 * method.
 */
import type { Adapter } from "../adapter/types.js";
import { runPipelineToCMM } from "../synthetic/runPipeline.js";
import { SYNTHETIC_FIXTURES, expectedTotalLatencyMs, type SyntheticPipelineSpec } from "../synthetic/fixtures.js";
import { SyntheticAdapter } from "../synthetic/syntheticAdapter.js";

export interface CalibrationResult {
  readonly pipelineId: string;
  readonly expectedTotalLatencyMs: number;
  readonly measuredTotalLatencyMs: number;
  /** measured - expected. Positive means the Core over-reported latency. */
  readonly errorMs: number;
  readonly errorPercent: number;
  readonly toleranceMs: number;
  readonly withinTolerance: boolean;
}

/** Default tolerance: generous enough to absorb floating-point summation error, tight enough to catch a real arithmetic bug. */
export const DEFAULT_CALIBRATION_TOLERANCE_MS = 0.01;

async function calibrate(
  spec: SyntheticPipelineSpec,
  buildAdapter: (spec: SyntheticPipelineSpec) => Adapter,
  toleranceMs: number
): Promise<CalibrationResult> {
  const adapter = buildAdapter(spec);
  const pipeline = await runPipelineToCMM(adapter, spec.name);
  const expected = expectedTotalLatencyMs(spec);
  const measured = pipeline.totalLatencyMeasurement?.value ?? Number.NaN;
  const errorMs = measured - expected;
  const errorPercent = expected === 0 ? 0 : (errorMs / expected) * 100;
  return {
    pipelineId: spec.id,
    expectedTotalLatencyMs: expected,
    measuredTotalLatencyMs: measured,
    errorMs,
    errorPercent,
    toleranceMs,
    withinTolerance: Math.abs(errorMs) <= toleranceMs
  };
}

/** Runs the known-delay calibration against one synthetic fixture. */
export function calibrateAgainstFixture(
  spec: SyntheticPipelineSpec,
  toleranceMs: number = DEFAULT_CALIBRATION_TOLERANCE_MS
): Promise<CalibrationResult> {
  return calibrate(spec, (s) => new SyntheticAdapter(s), toleranceMs);
}

/** Runs the known-delay calibration against every canonical synthetic fixture. */
export function calibrateAllFixtures(
  toleranceMs: number = DEFAULT_CALIBRATION_TOLERANCE_MS
): Promise<CalibrationResult[]> {
  return Promise.all(SYNTHETIC_FIXTURES.map((spec) => calibrateAgainstFixture(spec, toleranceMs)));
}

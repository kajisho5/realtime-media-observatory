/**
 * Clock Drift Detection & Estimation.
 *
 * Estimates the relationship between two clock domains — offset and drift
 * rate — from a series of paired timestamp observations, via ordinary
 * least-squares linear regression of (dest - source) against source time.
 * This is observation only: it never adjusts any clock, per the
 * OBSERVE/MEASURE/NORMALIZE/EXPOSE mandate.
 */
import type { ClockOffset, ConfidenceLevel, Timestamp } from "./types.js";
import { sameClock } from "./types.js";

export interface DriftSample {
  readonly source: Timestamp;
  readonly dest: Timestamp;
}

export class InsufficientDriftSamplesError extends Error {
  constructor(count: number) {
    super(`estimateDrift requires at least 2 paired samples, got ${count}`);
    this.name = "InsufficientDriftSamplesError";
  }
}

export class DriftSampleClockMismatchError extends Error {
  constructor() {
    super("All drift samples must share the same source clock and the same destination clock");
    this.name = "DriftSampleClockMismatchError";
  }
}

/**
 * Estimates a ClockOffset (offset + drift rate + confidence) from paired
 * (source, dest) timestamp observations. All samples must be on the same
 * pair of clocks. Requires >= 2 samples.
 */
export function estimateDrift(samples: readonly DriftSample[], measuredAtMs: number = Date.now()): ClockOffset {
  if (samples.length < 2) {
    throw new InsufficientDriftSamplesError(samples.length);
  }
  const from = samples[0]!.source.clock;
  const to = samples[0]!.dest.clock;
  for (const sample of samples) {
    if (!sameClock(sample.source.clock, from) || !sameClock(sample.dest.clock, to)) {
      throw new DriftSampleClockMismatchError();
    }
  }

  const xs = samples.map((s) => s.source.valueMs);
  const ys = samples.map((s) => s.dest.valueMs - s.source.valueMs);
  const n = samples.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let ssXX = 0;
  let ssXY = 0;
  let ssYY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssYY += dy * dy;
  }

  // slope: ms of offset change per ms of elapsed source time.
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const driftMsPerSec = slope * 1000;

  const rSquared = ssYY === 0 ? 1 : ssXX === 0 ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
  const spanMs = Math.max(...xs) - Math.min(...xs);

  return {
    from,
    to,
    offsetMs: intercept,
    driftMsPerSec,
    confidence: driftConfidence(n, rSquared, spanMs),
    measuredAtMs
  };
}

/**
 * Confidence rule: `high` requires enough samples (>= 10), a wide enough
 * observation window (>= 1s of source time) to make the drift *rate*
 * meaningful rather than noise, and a strong linear fit (R^2 >= 0.9).
 * `medium` requires only a minimally sound fit (>= 3 samples, R^2 >= 0.5).
 * Anything weaker is `low` — a slope computed from 2 noisy points is not
 * trustworthy even though the math produces a number.
 */
function driftConfidence(sampleCount: number, rSquared: number, spanMs: number): ConfidenceLevel {
  if (sampleCount >= 10 && rSquared >= 0.9 && spanMs >= 1000) return "high";
  if (sampleCount >= 3 && rSquared >= 0.5) return "medium";
  return "low";
}

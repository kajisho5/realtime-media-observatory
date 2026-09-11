import { describe, expect, it } from "vitest";
import { DriftSampleClockMismatchError, InsufficientDriftSamplesError, estimateDrift, type DriftSample } from "../src/clock/drift.js";
import type { ClockRef, Timestamp } from "../src/clock/types.js";

const sourceClock: ClockRef = { domain: "source_clock", id: "encoder" };
const destClock: ClockRef = { domain: "destination_clock", id: "player" };

function ts(clock: ClockRef, valueMs: number): Timestamp {
  return { clock, valueMs };
}

/** Builds noise-free paired samples for a known base offset + drift rate, sampled every `stepMs` of source time. */
function syntheticSamples(count: number, stepMs: number, baseOffsetMs: number, driftMsPerSec: number): DriftSample[] {
  const samples: DriftSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const sourceMs = i * stepMs;
    const offsetAtT = baseOffsetMs + driftMsPerSec * (sourceMs / 1000);
    samples.push({ source: ts(sourceClock, sourceMs), dest: ts(destClock, sourceMs + offsetAtT) });
  }
  return samples;
}

describe("estimateDrift", () => {
  it("recovers a known offset and drift rate from noise-free samples with high confidence", () => {
    const samples = syntheticSamples(10, 1000, 10, 0.7);
    const offset = estimateDrift(samples, Date.now());
    expect(offset.offsetMs).toBeCloseTo(10, 6);
    expect(offset.driftMsPerSec).toBeCloseTo(0.7, 6);
    expect(offset.confidence).toBe("high");
    expect(offset.from).toEqual(sourceClock);
    expect(offset.to).toEqual(destClock);
  });

  it("recovers zero drift for a constant offset", () => {
    const samples = syntheticSamples(10, 1000, 20, 0);
    const offset = estimateDrift(samples);
    expect(offset.offsetMs).toBeCloseTo(20, 6);
    expect(offset.driftMsPerSec).toBeCloseTo(0, 6);
  });

  it("reports lower confidence for a minimal, unconvincing sample set", () => {
    const samples = syntheticSamples(2, 1000, 5, 0.3);
    const offset = estimateDrift(samples);
    expect(offset.confidence).not.toBe("high");
  });

  it("throws InsufficientDriftSamplesError with fewer than 2 samples", () => {
    expect(() => estimateDrift([])).toThrow(InsufficientDriftSamplesError);
    expect(() => estimateDrift([{ source: ts(sourceClock, 0), dest: ts(destClock, 10) }])).toThrow(
      InsufficientDriftSamplesError
    );
  });

  it("throws DriftSampleClockMismatchError when samples span different clock pairs", () => {
    const mismatched: DriftSample[] = [
      { source: ts(sourceClock, 0), dest: ts(destClock, 10) },
      { source: ts({ domain: "source_clock", id: "other-encoder" }, 1000), dest: ts(destClock, 1010) }
    ];
    expect(() => estimateDrift(mismatched)).toThrow(DriftSampleClockMismatchError);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { BufferTracker, EventCounter, StageRecorder, computeJitterMs, resetIdCounter, totalLatency, worstOf } from "../src/core/index.js";
import type { Timestamp } from "../src/clock/types.js";

const clock = { domain: "monotonic", id: "test" } as const;
const ts = (valueMs: number): Timestamp => ({ clock, valueMs });

beforeEach(() => {
  resetIdCounter();
});

describe("StageRecorder", () => {
  it("computes latency as end - start on the same clock", () => {
    const recorder = new StageRecorder();
    recorder.start("capture", ts(0));
    const measurement = recorder.end("capture", ts(10));
    expect(measurement.name).toBe("latency_ms");
    expect(measurement.value).toBe(10);
    expect(measurement.provenance).toEqual({ kind: "measured", method: "timestamp", confidence: "high" });
  });

  it("throws UnknownStageError when ending a stage that never started", () => {
    const recorder = new StageRecorder();
    expect(() => recorder.end("never-started", ts(10))).toThrow(/No start event recorded/);
  });

  it("consumes the start event so a second end() call fails", () => {
    const recorder = new StageRecorder();
    recorder.start("capture", ts(0));
    recorder.end("capture", ts(10));
    expect(() => recorder.end("capture", ts(20))).toThrow();
  });
});

describe("totalLatency", () => {
  it("sums stage latencies and bounds confidence to the worst input", () => {
    const measurements = [
      { id: "a", name: "latency_ms", value: 10, unit: "ms" as const, provenance: { kind: "measured" as const, method: "timestamp", confidence: "high" as const } },
      { id: "b", name: "latency_ms", value: 5, unit: "ms" as const, provenance: { kind: "measured" as const, method: "rtt", confidence: "medium" as const } }
    ];
    const total = totalLatency(measurements);
    expect(total.value).toBe(15);
    expect(total.provenance.confidence).toBe("medium");
    expect(total.provenance.kind).toBe("derived");
    expect(total.provenance.sourceIds).toEqual(["a", "b"]);
  });
});

describe("worstOf", () => {
  it("returns the lowest confidence among inputs", () => {
    expect(worstOf(["high", "medium", "high"])).toBe("medium");
    expect(worstOf(["low", "high"])).toBe("low");
    expect(worstOf(["high", "high"])).toBe("high");
  });
});

describe("computeJitterMs", () => {
  it("returns 0 for fewer than 2 samples", () => {
    expect(computeJitterMs([])).toBe(0);
    expect(computeJitterMs([10])).toBe(0);
  });

  it("computes sample standard deviation for known values", () => {
    // mean=5, deviations: -3,-1,1,3 -> squared: 9,1,1,9 sum=20, /3=6.667, sqrt~2.581
    expect(computeJitterMs([2, 4, 6, 8])).toBeCloseTo(2.581, 2);
  });
});

describe("BufferTracker", () => {
  it("reports the last-set level as a measurement", () => {
    const tracker = new BufferTracker();
    tracker.set(42);
    expect(tracker.measurement().value).toBe(42);
    expect(tracker.measurement().unit).toBe("percent");
  });

  it("rejects out-of-range levels", () => {
    const tracker = new BufferTracker();
    expect(() => tracker.set(150)).toThrow(RangeError);
    expect(() => tracker.set(-1)).toThrow(RangeError);
  });
});

describe("EventCounter", () => {
  it("counts increments and reports as a measurement", () => {
    const counter = new EventCounter("xrun_count");
    counter.increment();
    counter.increment(2);
    const m = counter.measurement();
    expect(m.value).toBe(3);
    expect(m.name).toBe("xrun_count");
  });
});

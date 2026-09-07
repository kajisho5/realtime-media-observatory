import { describe, expect, it } from "vitest";
import { RateCounter, RollingWindow } from "../src/core/rolling.js";
import { measureCoreOverheadMs } from "../src/core/overhead.js";

describe("RollingWindow", () => {
  it("keeps at most maxSamples, dropping the oldest first", () => {
    const window = new RollingWindow({ maxSamples: 3 });
    [1, 2, 3, 4, 5].forEach((v, i) => window.add(v, i));
    expect(window.values()).toEqual([3, 4, 5]);
    expect(window.size()).toBe(3);
  });

  it("drops samples older than maxAgeMs relative to the latest add()", () => {
    const window = new RollingWindow({ maxAgeMs: 100 });
    window.add(1, 0);
    window.add(2, 50);
    window.add(3, 250); // now=250, cutoff=150 -> samples at 0 and 50 are dropped
    expect(window.values()).toEqual([3]);
  });

  it("computes rolling mean and jitter matching the batch implementations", () => {
    const window = new RollingWindow();
    [2, 4, 6, 8].forEach((v, i) => window.add(v, i));
    expect(window.mean()).toBe(5);
    expect(window.jitterMs()).toBeCloseTo(2.581, 2);
  });

  it("mean/jitter are 0 on an empty window rather than NaN", () => {
    const window = new RollingWindow();
    expect(window.mean()).toBe(0);
    expect(window.jitterMs()).toBe(0);
  });
});

describe("RateCounter", () => {
  it("reports events per second within the trailing window", () => {
    const counter = new RateCounter(1000); // 1s window
    counter.record(0);
    counter.record(100);
    counter.record(200);
    // 3 events in a 1s window -> 3/s, evaluated at t=200 (all still in window)
    expect(counter.ratePerSecond(200)).toBe(3);
  });

  it("excludes events that have aged out of the window", () => {
    const counter = new RateCounter(1000);
    counter.record(0);
    counter.record(2000); // far outside the window relative to t=0
    expect(counter.countInWindow(2000)).toBe(1);
    expect(counter.ratePerSecond(2000)).toBe(1);
  });
});

describe("measureCoreOverheadMs", () => {
  it("reports a small, non-negative per-call overhead as a measured Measurement", () => {
    const measurement = measureCoreOverheadMs(2000);
    expect(measurement.name).toBe("core_overhead_ms_per_call");
    expect(measurement.provenance.kind).toBe("measured");
    expect(measurement.value).toBeGreaterThanOrEqual(0);
    // Generous upper bound: the recording primitives are plain object/Map
    // operations and should cost microseconds, not milliseconds, per call.
    expect(measurement.value).toBeLessThan(5);
  });
});

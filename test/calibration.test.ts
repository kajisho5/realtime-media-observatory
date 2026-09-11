import { describe, expect, it } from "vitest";
import { SYNTHETIC_FIXTURES } from "../src/synthetic/fixtures.js";
import { calibrateAgainstFixture, calibrateAllFixtures } from "../src/calibration/knownDelay.js";

describe("Measurement Calibration (known-delay reference)", () => {
  it.each(SYNTHETIC_FIXTURES)("computed total latency for '$id' is within tolerance of the known expected value", async (spec) => {
    const result = await calibrateAgainstFixture(spec);
    expect(result.withinTolerance).toBe(true);
    expect(Math.abs(result.errorMs)).toBeLessThanOrEqual(result.toleranceMs);
  });

  it("reports errorMs and errorPercent relative to the known expected latency", async () => {
    const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "camera-to-display")!;
    const result = await calibrateAgainstFixture(spec);
    expect(result.expectedTotalLatencyMs).toBe(38);
    expect(result.measuredTotalLatencyMs).toBeCloseTo(38, 6);
    expect(result.errorMs).toBeCloseTo(0, 6);
  });

  it("calibrateAllFixtures returns one result per fixture, all within tolerance", async () => {
    const results = await calibrateAllFixtures();
    expect(results).toHaveLength(SYNTHETIC_FIXTURES.length);
    for (const result of results) {
      expect(result.withinTolerance).toBe(true);
    }
  });

  it("a deliberately wrong expected value would be flagged as out of tolerance (negative-test sanity check)", async () => {
    const spec = SYNTHETIC_FIXTURES[0]!;
    const result = await calibrateAgainstFixture(spec, 0.01);
    const fakeExpected = result.expectedTotalLatencyMs + 5; // 5ms off, far beyond tolerance
    const fakeErrorMs = result.measuredTotalLatencyMs - fakeExpected;
    expect(Math.abs(fakeErrorMs)).toBeGreaterThan(result.toleranceMs);
  });
});

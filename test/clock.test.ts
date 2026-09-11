import { describe, expect, it } from "vitest";
import { ClockDomainMismatchError, diffMs } from "../src/clock/compare.js";
import type { ClockOffset, Timestamp } from "../src/clock/types.js";

describe("Clock/Timestamp Model", () => {
  it("diffs two timestamps on the same clock without an offset", () => {
    const a: Timestamp = { clock: { domain: "monotonic", id: "system" }, valueMs: 100 };
    const b: Timestamp = { clock: { domain: "monotonic", id: "system" }, valueMs: 40 };
    expect(diffMs(a, b)).toBe(60);
  });

  it("throws ClockDomainMismatchError for cross-domain diff without an offset", () => {
    const a: Timestamp = { clock: { domain: "capture_timestamp", id: "cam1" }, valueMs: 100 };
    const b: Timestamp = { clock: { domain: "presentation_timestamp", id: "disp1" }, valueMs: 40 };
    expect(() => diffMs(a, b)).toThrow(ClockDomainMismatchError);
  });

  it("applies an explicit offset to correctly diff cross-domain timestamps", () => {
    const source: Timestamp = { clock: { domain: "source_clock", id: "encoder" }, valueMs: 1000 };
    const dest: Timestamp = { clock: { domain: "destination_clock", id: "player" }, valueMs: 1050 };
    // destination clock runs 20ms ahead of source clock at measurement time, no drift.
    const offset: ClockOffset = {
      from: source.clock,
      to: dest.clock,
      offsetMs: 20,
      confidence: "high",
      measuredAtMs: Date.now()
    };
    // dest - source, projecting source into dest's domain: (1000 + 20) = 1020; 1050 - 1020 = 30
    expect(diffMs(dest, source, offset)).toBe(30);
  });

  it("accounts for drift rate when applying an offset well after it was measured", () => {
    const source: Timestamp = { clock: { domain: "source_clock", id: "encoder" }, valueMs: 0 };
    const dest: Timestamp = { clock: { domain: "destination_clock", id: "player" }, valueMs: 0 };
    const measuredAtMs = Date.now() - 10_000; // measured 10s ago
    const offset: ClockOffset = {
      from: source.clock,
      to: dest.clock,
      offsetMs: 0,
      driftMsPerSec: 0.7,
      confidence: "medium",
      measuredAtMs
    };
    // Projecting source(0) into dest domain 10s later should have drifted ~7ms.
    const diff = diffMs(dest, source, offset, measuredAtMs + 10_000);
    expect(diff).toBeCloseTo(-7, 0);
  });
});

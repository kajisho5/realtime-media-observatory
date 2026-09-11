import { type ClockOffset, type Timestamp, sameClock } from "./types.js";

/**
 * Thrown when two timestamps from different clock domains are compared
 * without an explicit ClockOffset. This is the guardrail: it makes an
 * accidental cross-domain subtraction fail loudly instead of silently
 * producing a wrong latency number.
 */
export class ClockDomainMismatchError extends Error {
  constructor(a: Timestamp, b: Timestamp) {
    super(
      `Cannot compare timestamps from different clocks without an explicit ClockOffset: ` +
        `${a.clock.domain}:${a.clock.id} vs ${b.clock.domain}:${b.clock.id}`
    );
    this.name = "ClockDomainMismatchError";
  }
}

/**
 * Applies a ClockOffset to project a timestamp from `offset.from` into
 * `offset.to`'s domain, accounting for drift elapsed since the offset was
 * measured (if the offset carries a drift rate).
 */
export function applyOffset(ts: Timestamp, offset: ClockOffset, nowMs: number): Timestamp {
  if (!sameClock(ts.clock, offset.from)) {
    throw new Error(
      `ClockOffset.from (${offset.from.domain}:${offset.from.id}) does not match timestamp's clock ` +
        `(${ts.clock.domain}:${ts.clock.id})`
    );
  }
  const elapsedSinceMeasuredSec = Math.max(0, (nowMs - offset.measuredAtMs) / 1000);
  const driftAdjustmentMs = (offset.driftMsPerSec ?? 0) * elapsedSinceMeasuredSec;
  return {
    clock: offset.to,
    valueMs: ts.valueMs + offset.offsetMs + driftAdjustmentMs
  };
}

/**
 * Computes `a - b` in milliseconds. If `a` and `b` are on the same clock,
 * this is a plain subtraction. If they are on different clocks, an explicit
 * `offset` (converting `b`'s clock into `a`'s clock, or vice versa) MUST be
 * supplied, or this throws ClockDomainMismatchError.
 */
export function diffMs(a: Timestamp, b: Timestamp, offset?: ClockOffset, nowMs: number = Date.now()): number {
  if (sameClock(a.clock, b.clock)) {
    return a.valueMs - b.valueMs;
  }
  if (!offset) {
    throw new ClockDomainMismatchError(a, b);
  }
  if (sameClock(offset.from, b.clock) && sameClock(offset.to, a.clock)) {
    const bProjected = applyOffset(b, offset, nowMs);
    return a.valueMs - bProjected.valueMs;
  }
  if (sameClock(offset.from, a.clock) && sameClock(offset.to, b.clock)) {
    const aProjected = applyOffset(a, offset, nowMs);
    return aProjected.valueMs - b.valueMs;
  }
  throw new Error(
    "Provided ClockOffset does not relate the two timestamps' clocks; " +
      "offset.from/to must match one timestamp each."
  );
}

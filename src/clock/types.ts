/**
 * Clock / Timestamp Model.
 *
 * Realtime media pipelines involve multiple, non-comparable clock domains.
 * Every timestamp in the system must declare which clock it belongs to, and
 * comparisons across domains must go through an explicit ClockOffset rather
 * than a bare numeric subtraction.
 */

export type ClockDomain =
  | "monotonic"
  | "wall"
  | "media_timestamp"
  | "capture_timestamp"
  | "presentation_timestamp"
  | "source_clock"
  | "destination_clock";

export type ConfidenceLevel = "high" | "medium" | "low";

/** Identifies a specific clock: its domain plus an origin id (e.g. "obs.capture", "system.monotonic"). */
export interface ClockRef {
  readonly domain: ClockDomain;
  /** Identifies the concrete clock source within its domain, e.g. "system", "obs.capture-device-1". */
  readonly id: string;
}

/** A point in time expressed against a specific clock. Value is milliseconds since that clock's own epoch/start. */
export interface Timestamp {
  readonly clock: ClockRef;
  readonly valueMs: number;
}

/**
 * A measured relationship between two clock domains: how much `to` is
 * offset from `from`, and (optionally) how fast that offset is changing.
 */
export interface ClockOffset {
  readonly from: ClockRef;
  readonly to: ClockRef;
  /** to.valueMs = from.valueMs + offsetMs (at the time this offset was measured). */
  readonly offsetMs: number;
  /** Rate of change of the offset, in ms per second. Undefined if not yet estimated. */
  readonly driftMsPerSec?: number;
  readonly confidence: ConfidenceLevel;
  /** Wall-clock time (epoch ms) at which this offset was measured. */
  readonly measuredAtMs: number;
}

export function sameClock(a: ClockRef, b: ClockRef): boolean {
  return a.domain === b.domain && a.id === b.id;
}

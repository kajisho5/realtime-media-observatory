/**
 * Realtime Metrics Engine: streaming/online statistics for a live
 * `realtime-observe` session, as opposed to the one-shot batch computation
 * used for a single synthetic run (src/synthetic/runPipeline.ts).
 *
 * Window/decay strategy: a fixed-size sliding window, bounded by sample
 * count and/or wall-clock age (whichever is configured). This is a simple,
 * predictable strategy — no exponential decay — chosen so a reported
 * jitter/latency figure always corresponds to an inspectable, bounded set
 * of recent samples rather than an opaque running average.
 */
import { computeJitterMs } from "./jitter.js";

export interface RollingWindowOptions {
  /** Keep at most this many most-recent samples. */
  readonly maxSamples?: number;
  /** Drop samples older than this many ms relative to the most recent `add()` call's `atMs`. */
  readonly maxAgeMs?: number;
}

interface Sample {
  readonly value: number;
  readonly atMs: number;
}

/** A bounded sliding window of latency (or any numeric) samples, with rolling mean/jitter. */
export class RollingWindow {
  private samples: Sample[] = [];

  constructor(private readonly options: RollingWindowOptions = {}) {}

  add(value: number, atMs: number = Date.now()): void {
    this.samples.push({ value, atMs });
    this.prune(atMs);
  }

  private prune(nowMs: number): void {
    if (this.options.maxAgeMs !== undefined) {
      const cutoff = nowMs - this.options.maxAgeMs;
      this.samples = this.samples.filter((s) => s.atMs >= cutoff);
    }
    if (this.options.maxSamples !== undefined && this.samples.length > this.options.maxSamples) {
      this.samples = this.samples.slice(this.samples.length - this.options.maxSamples);
    }
  }

  values(): number[] {
    return this.samples.map((s) => s.value);
  }

  size(): number {
    return this.samples.length;
  }

  mean(): number {
    const vs = this.values();
    if (vs.length === 0) return 0;
    return vs.reduce((a, b) => a + b, 0) / vs.length;
  }

  jitterMs(): number {
    return computeJitterMs(this.values());
  }
}

/**
 * Tracks the rate of a discrete event (drops, XRUN) over a trailing window,
 * so a live session reports "events/sec right now" rather than only a
 * cumulative count since start.
 */
export class RateCounter {
  private eventTimesMs: number[] = [];

  constructor(private readonly windowMs: number) {}

  record(atMs: number = Date.now()): void {
    this.eventTimesMs.push(atMs);
    this.prune(atMs);
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    this.eventTimesMs = this.eventTimesMs.filter((t) => t >= cutoff);
  }

  /** Events per second within the trailing window, as of `nowMs`. */
  ratePerSecond(nowMs: number = Date.now()): number {
    this.prune(nowMs);
    return this.eventTimesMs.length / (this.windowMs / 1000);
  }

  countInWindow(nowMs: number = Date.now()): number {
    this.prune(nowMs);
    return this.eventTimesMs.length;
  }
}

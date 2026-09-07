/**
 * Instrumentation Core: stage start/end -> duration/latency.
 *
 * Generic, system-agnostic primitives. This module must never import or
 * reference OBS, VST, WebRTC, FFmpeg, or any other concrete external
 * system — see docs/architecture/adapter-boundary and the core-purity CI
 * check (scripts/check-core-purity.mjs).
 */
import { diffMs } from "../clock/compare.js";
import type { ClockOffset, Timestamp } from "../clock/types.js";
import type { Measurement } from "../model/types.js";
import { nextId } from "./ids.js";

export class UnknownStageError extends Error {
  constructor(stageId: string) {
    super(`No start event recorded for stage "${stageId}"`);
    this.name = "UnknownStageError";
  }
}

/**
 * Records stage start events and turns a matching end event into a
 * `latency_ms` Measurement (provenance: measured, method: timestamp).
 */
export class StageRecorder {
  private readonly starts = new Map<string, Timestamp>();

  start(stageId: string, ts: Timestamp): void {
    this.starts.set(stageId, ts);
  }

  /**
   * Records the end of a stage and returns the resulting latency
   * Measurement. `offset` is required only if the end timestamp is on a
   * different clock than the start timestamp.
   */
  end(stageId: string, ts: Timestamp, offset?: ClockOffset): Measurement {
    const start = this.starts.get(stageId);
    if (!start) {
      throw new UnknownStageError(stageId);
    }
    this.starts.delete(stageId);
    const latencyMs = diffMs(ts, start, offset);
    return {
      id: nextId("measurement"),
      name: "latency_ms",
      value: latencyMs,
      unit: "ms",
      provenance: { kind: "measured", method: "timestamp", confidence: "high" },
      timestamp: ts
    };
  }

  /** True if `start()` was called for `stageId` and `end()` has not yet consumed it. */
  isOpen(stageId: string): boolean {
    return this.starts.has(stageId);
  }
}

/** Sums a set of stage latency measurements into a single `total_latency_ms` derived Measurement. */
export function totalLatency(stageLatencies: readonly Measurement[]): Measurement {
  const value = stageLatencies.reduce((sum, m) => sum + m.value, 0);
  const worstConfidence = worstOf(stageLatencies.map((m) => m.provenance.confidence));
  return {
    id: nextId("measurement"),
    name: "total_latency_ms",
    value,
    unit: "ms",
    provenance: {
      kind: "derived",
      method: "timestamp",
      confidence: worstConfidence,
      sourceIds: stageLatencies.map((m) => m.id)
    }
  };
}

const CONFIDENCE_RANK: Record<"high" | "medium" | "low", number> = { high: 2, medium: 1, low: 0 };

/** A derived measurement's confidence must never exceed the lowest confidence among its inputs. */
export function worstOf(levels: readonly ("high" | "medium" | "low")[]): "high" | "medium" | "low" {
  if (levels.length === 0) return "low";
  return levels.reduce((worst, level) => (CONFIDENCE_RANK[level] < CONFIDENCE_RANK[worst] ? level : worst));
}

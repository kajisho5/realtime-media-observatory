/**
 * Common Measurement Model (CMM).
 *
 * The single, system-agnostic vocabulary every Adapter converts external
 * signals into, and every consumer (CLI, JSON, WebSocket, dashboard, AI
 * agent) reads from. Nothing in this module may reference OBS, VST, WebRTC,
 * FFmpeg, or any other concrete external system.
 */
import type { ClockRef, ConfidenceLevel, Timestamp } from "../clock/types.js";

export const CMM_SCHEMA_VERSION = "0.1.0";

/**
 * How a measurement was obtained, per the provenance taxonomy:
 * - measured: read directly from a timestamped event (e.g. stage start/end).
 * - derived: computed from other measurements already in this report (e.g. total latency = sum of stages).
 * - estimated: computed from an indirect signal (e.g. round-trip time, correlation).
 * - inferred: not directly observed; reasoned from context/heuristics.
 */
export type ProvenanceKind = "measured" | "derived" | "estimated" | "inferred";

/** The technique used to obtain the value. Free-form beyond the common set, but must be non-empty. */
export type MeasurementMethod = "timestamp" | "rtt" | "correlation" | "counter" | "regression" | "estimated" | (string & {});

export interface Provenance {
  readonly kind: ProvenanceKind;
  readonly method: MeasurementMethod;
  readonly confidence: ConfidenceLevel;
  /** ids of the Measurements this one was derived/estimated from, if any. */
  readonly sourceIds?: readonly string[];
}

export interface Measurement {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly unit: "ms" | "count" | "percent" | "ms_per_s" | (string & {});
  readonly provenance: Provenance;
  readonly timestamp?: Timestamp;
}

export interface Stage {
  readonly id: string;
  readonly name: string;
  readonly measurements: readonly Measurement[];
}

export interface Pipeline {
  readonly schemaVersion: string;
  readonly id: string;
  readonly name: string;
  readonly stages: readonly Stage[];
  readonly totalLatencyMeasurement?: Measurement;
  readonly jitterMeasurement?: Measurement;
  readonly clockDriftMeasurement?: Measurement;
  readonly dropsMeasurement?: Measurement;
  readonly xrunMeasurement?: Measurement;
  readonly bufferMeasurement?: Measurement;
  /** Wall-clock time (ISO 8601) the report was generated. */
  readonly generatedAt: string;
}

/** Convenience accessor: sum of `latency_ms` measurements across stages, ms. */
export function totalLatencyMs(pipeline: Pipeline): number | undefined {
  return pipeline.totalLatencyMeasurement?.value;
}

export function findMeasurement(stage: Stage, name: string): Measurement | undefined {
  return stage.measurements.find((m) => m.name === name);
}

export function clockRefKey(ref: ClockRef): string {
  return `${ref.domain}:${ref.id}`;
}

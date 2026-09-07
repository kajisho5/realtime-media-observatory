/**
 * Measurement Provenance & Confidence Taxonomy.
 *
 * See docs/architecture/provenance-confidence.md for the full taxonomy and
 * rationale. In short: every Measurement must declare how it was obtained
 * (`kind`/`method`) and how much to trust it (`confidence`). A value
 * derived/estimated from other measurements may never claim a confidence
 * higher than the least-confident measurement it was built from.
 */
import type { ConfidenceLevel } from "../clock/types.js";
import type { Measurement, MeasurementMethod, Provenance, ProvenanceKind } from "./types.js";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 2, medium: 1, low: 0 };

/** Returns the lowest confidence among `levels`. An empty input is treated as `low` (no basis for trust). */
export function worstConfidence(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return "low";
  return levels.reduce((worst, level) => (CONFIDENCE_RANK[level] < CONFIDENCE_RANK[worst] ? level : worst));
}

/**
 * Builds the Provenance for a value derived/estimated from `sources`. The
 * resulting confidence is bounded by the lowest-confidence source — a
 * derived value is never more trustworthy than its weakest input. If
 * `sources` is empty (e.g. a pure estimate with no measured inputs),
 * `confidence` must be supplied explicitly.
 */
export function deriveProvenance(
  kind: Exclude<ProvenanceKind, "measured">,
  method: MeasurementMethod,
  sources: readonly Measurement[],
  explicitConfidence?: ConfidenceLevel
): Provenance {
  const confidence = explicitConfidence ?? worstConfidence(sources.map((m) => m.provenance.confidence));
  return {
    kind,
    method,
    confidence,
    sourceIds: sources.map((m) => m.id)
  };
}

/** Provenance for a value read directly from a timestamped/counted event — the strongest kind. */
export function measuredProvenance(method: MeasurementMethod): Provenance {
  return { kind: "measured", method, confidence: "high" };
}

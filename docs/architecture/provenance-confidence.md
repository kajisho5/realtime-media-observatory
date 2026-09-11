# Measurement Provenance & Confidence Taxonomy

Related: [Issue #9](https://github.com/kajisho5/realtime-media-observatory/issues/9)

The system must distinguish measured, derived, estimated, and inferred
values, and never present an estimate as a fact (see the
[AI Agent Boundary ADR](./ai-agent-boundary.md) and
[Common Measurement Model](./common-measurement-model.md)). This document
defines the taxonomy and its propagation rule; the implementation lives in
`src/model/provenance.ts`.

## `provenance.kind`

| kind | definition | example |
|---|---|---|
| `measured` | Read directly from a single timestamped event or counter — no arithmetic across other measurements. | Stage `latency_ms` from a matched start/end timestamp pair; a drop/XRUN counter. |
| `derived` | Computed from other Measurements already present in this report, via defined arithmetic (sum, stddev, ...). | `total_latency_ms` (sum of stage latencies); `jitter_ms` (stddev of stage latencies). |
| `estimated` | Computed from an indirect signal that approximates, rather than directly observes, the value. | Round-trip-time-based latency (e.g. WebRTC `getStats()`), correlation-based audio calibration. |
| `inferred` | Not directly observed; reasoned from context or a heuristic rather than a signal tied to this measurement. | (Reserved for future adapters; none of the current P0/P1 code produces `inferred` values.) |

## `provenance.confidence`

`high` / `medium` / `low`. Confidence is a statement about how much a
consumer should trust the *value*, independent of how interesting or
severe it is — the Observatory does not editorialize (see the AI Agent
Boundary ADR).

## Propagation rule

**A derived measurement's confidence is bounded by the lowest confidence
among its inputs.** A `total_latency_ms` built from four high-confidence
stage latencies and one medium-confidence stage latency is reported as
`medium`, never silently upgraded to `high`. This is implemented by
`deriveProvenance()` in `src/model/provenance.ts`, which every derived
measurement in `src/core` goes through (see `totalLatency()` in
`src/core/stage.ts`).

Exception: some derived measurements have a confidence basis that is
*not* "the confidence of their inputs' values" but a separate statistical
property. `jitter_ms` is the current example: its confidence reflects
whether there were enough samples to compute a meaningful standard
deviation (`>= 2` samples), not the confidence of the individual stage
latencies that fed it — a jitter figure computed from only one sample is
low-confidence even if that one sample was itself high-confidence. Such
exceptions must document, at the call site, why the statistical basis
differs from simple propagation (see `jitterMeasurement()` in
`src/core/jitter.ts`).

## Validation

The Common Measurement Model's JSON Schema (`src/model/schema.ts`) marks
`provenance` (and, within it, `kind`, `method`, `confidence`) as
`required` on every `Measurement` — a measurement missing provenance
fails `validatePipeline()` / `assertValidPipeline()` (see
`src/model/validate.ts` and `test/model.test.ts`).

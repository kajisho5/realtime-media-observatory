# Measurement Calibration

Related: [Issue #12](https://github.com/kajisho5/realtime-media-observatory/issues/12)

Accuracy claims must be backed by tests, not asserted. This document
records the current calibration method and its actual results.

## Method: known-delay reference

Implemented in `src/calibration/knownDelay.ts`. The method runs a pipeline
whose stage timing is precisely known — the
[Synthetic Pipeline Test Harness](./common-measurement-model.md) (issue
#5) — through the full Adapter → Instrumentation Core → Common
Measurement Model path, and compares the Core's computed
`total_latency_ms` against the known expected value.

```ts
const result = await calibrateAgainstFixture(SYNTHETIC_FIXTURES[0]);
// { expectedTotalLatencyMs: 38, measuredTotalLatencyMs: 38, errorMs: 0, ... }
```

## What this method does and does not validate

This validates the Instrumentation Core's **arithmetic** — that stage
timing fed into `StageRecorder`/`totalLatency()` comes back out correctly
summed, with no rounding or accumulation bugs. It does **not** validate
real-world measurement accuracy against physical hardware (camera,
microphone, display, network), because the Synthetic Harness injects
exact synthetic clock values rather than measuring a real delay end to
end.

Real-world accuracy is the job of
[Real Hardware Validation](https://github.com/kajisho5/realtime-media-observatory/issues/15)
(issue #15), which is expected to add a second calibration method (a
hardware loopback reference) using this same `CalibrationResult` shape.

## Results (current, computed against `main`)

Run via `calibrateAllFixtures()` (`test/calibration.test.ts` runs this as
part of the suite):

| Fixture | Expected (ms) | Measured (ms) | Error (ms) | Tolerance (ms) |
|---|---:|---:|---:|---:|
| `camera-to-display` | 38 | 38 | 0 | 0.01 |
| `obs-glass-to-glass` | 62.5 | 62.5 | 0 | 0.01 |
| `audio-round-trip` | 6.5 | 6.5 | 0 | 0.01 |

Zero error is expected here — it demonstrates the Core introduces no
computational error on top of the (exact, synthetic) input timing. It is
**not** evidence of real-world hardware measurement accuracy; do not cite
these numbers as such.

## Confidence assignment

Per the
[Provenance & Confidence Taxonomy](./provenance-confidence.md) (#9),
confidence levels should be traceable to calibration results where
available, not asserted. Until Real Hardware Validation (#15) produces a
hardware-backed error bound, no Measurement in this codebase claims
confidence *because of* calibration — the `measured`/`derived`
confidence levels currently in use (see `src/model/provenance.ts`) are
based on provenance kind and sample count only.

# Common Measurement Model

Related: [Issue #1](https://github.com/kajisho5/realtime-media-observatory/issues/1)

The Common Measurement Model (CMM) is the single, system-agnostic
vocabulary every Adapter converts external signals into, and every
consumer (CLI, JSON, WebSocket, dashboard, AI agent) reads from. See
`src/model/types.ts` for the TypeScript types and `src/model/schema.ts`
for the corresponding JSON Schema (used to validate `realtime-observe
--json` output — see `src/model/validate.ts`).

## Shape

```json
{
  "schemaVersion": "0.1.0",
  "id": "pipeline-1",
  "name": "camera-to-display",
  "generatedAt": "2026-09-07T12:00:00.000Z",
  "stages": [
    {
      "id": "capture",
      "name": "capture",
      "measurements": [
        {
          "id": "measurement-1",
          "name": "latency_ms",
          "value": 8.2,
          "unit": "ms",
          "provenance": { "kind": "measured", "method": "timestamp", "confidence": "high" }
        }
      ]
    }
  ],
  "totalLatencyMeasurement": {
    "id": "measurement-9",
    "name": "total_latency_ms",
    "value": 68.3,
    "unit": "ms",
    "provenance": { "kind": "derived", "method": "timestamp", "confidence": "high", "sourceIds": ["measurement-1"] }
  }
}
```

## Provenance and confidence

Every `Measurement` carries a `provenance` object:

- `kind`: `measured` (read directly from a timestamped event) / `derived`
  (computed from other measurements in this report) / `estimated`
  (computed from an indirect signal such as round-trip time) / `inferred`
  (reasoned from context, not directly observed).
- `method`: the technique used (`timestamp`, `rtt`, `correlation`,
  `counter`, `regression`, ...).
- `confidence`: `high` / `medium` / `low`.

A derived measurement's confidence is bounded by the lowest confidence
among its inputs (`worstOf` in `src/core/stage.ts`) — a total latency
built from one high-confidence and one low-confidence stage is reported
as low confidence, never silently upgraded.

See the [AI Agent Boundary ADR](./ai-agent-boundary.md): the model
intentionally has no field for a conclusion, severity, or recommendation.

## Clock domains

Every `Timestamp` embedded in a `Measurement` references an explicit
`ClockRef` (domain + id). Comparing two timestamps from different clocks
requires an explicit `ClockOffset` (see `src/clock/`) — there is no way to
silently subtract two unrelated clocks.

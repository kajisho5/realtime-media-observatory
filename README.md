# Realtime Media Observatory

A generic **observability and instrumentation platform for realtime media
pipelines** — latency, stage latency, jitter, buffering, dropped
frames/samples, underrun/overrun, XRUN, timestamps, clock domains, clock
drift, and measurement provenance/confidence.

This is an **observability layer**, not a media processing engine, not a
low-latency audio engine, not an OBS-only plugin, not a DAW, and not an AI
diagnosis engine. It does not modify user configuration automatically. Its
job is:

```
OBSERVE -> MEASURE -> NORMALIZE -> EXPOSE
```

Decision-making (root cause, recommendations) belongs to a higher-level
application or AI Agent consuming the Observatory's output — see
[`docs/architecture/ai-agent-boundary.md`](docs/architecture/ai-agent-boundary.md).

## Architecture

```
External Realtime Media (OBS, DAW/VST3/AU, WebRTC, ...)
        |
     Adapters                     <- external-system-specific, translates into the model below
        |
Instrumentation Core              <- generic: stage timing, jitter, buffer, drops, XRUN, drift
        |
Common Measurement Model          <- the single, system-agnostic data contract
        |
   CLI / JSON / WebSocket
        |
  Dashboard / AI Agent
```

The Instrumentation Core and Common Measurement Model must stay independent
of any concrete external system (OBS, VST, WebRTC, FFmpeg, ...) — enforced
by `npm run check:core-purity` in CI. See
[`docs/architecture/common-measurement-model.md`](docs/architecture/common-measurement-model.md)
for the data model and
[the GitHub issue roadmap](https://github.com/kajisho5/realtime-media-observatory/issues)
for the full implementation plan (priorities P0-P3).

## Status

Early stage. The current implementation covers the P0 foundation:

- **Common Measurement Model** (`src/model`) — the canonical
  pipeline/stage/measurement/provenance schema, with JSON Schema
  validation.
- **Clock/Timestamp Model** (`src/clock`) — explicit clock domains;
  comparing timestamps across domains without an explicit offset throws.
- **Instrumentation Core** (`src/core`) — stage start/end -> latency,
  jitter, buffer state, drop/XRUN counters. No adapter-specific code.
- **Adapter Interface** (`src/adapter`) — the formal contract every future
  integration (Audio, OBS, VST3/AU, WebRTC, ...) must implement, plus a
  reference `ExampleAdapter`.
- **Synthetic Pipeline Test Harness** (`src/synthetic`) — deterministic,
  hardware-free fixtures with known expected latency, used by CI.
- **CLI** (`realtime-observe`) — runs a synthetic pipeline and prints a
  pipeline-first report, human-readable or `--json`.

Everything past this point (real Audio/OBS/VST3/WebRTC adapters,
calibration, dashboard, streaming/Prometheus/OpenTelemetry reporting) is
tracked as GitHub issues, not yet implemented.

## Quickstart

```bash
npm install
npm run build
npx realtime-observe run              # human-readable pipeline report
npx realtime-observe run --json       # machine-readable, CMM-schema-valid JSON
npx realtime-observe run --pipeline audio-round-trip
npx realtime-observe list             # list available synthetic fixtures
```

During development, skip the build step with:

```bash
npm run cli -- run --json
```

Example output:

```
REALTIME MEDIA OBSERVATORY — camera-to-display

  TOTAL LATENCY   38.0ms
  JITTER          7.6ms
  DROPPED         0
  XRUN            0

  PIPELINE
    capture        10.0ms
    buffer         5.0ms
    processing     3.0ms
    network        20.0ms

  measurement: timestamp   confidence: high
```

## Development

```bash
npm install
npm run build              # tsc -> dist/
npm test                   # vitest
npm run check:core-purity  # fails if OBS/VST/WebRTC/FFmpeg identifiers leak into src/core or src/model
```

CI (`.github/workflows/ci.yml`) runs the core-purity check, build, and test
suite on every push/PR.

## Project layout

```
src/
  model/       Common Measurement Model: types, JSON Schema, validation
  clock/       Clock domains, ClockOffset/drift, guarded cross-domain diff
  core/        Instrumentation Core: stage timing, jitter, buffer, counters
  adapter/     Adapter interface + reference ExampleAdapter
  synthetic/   Deterministic test fixtures + the CLI's pipeline runner
  cli/         `realtime-observe` entry point
docs/architecture/  Architecture decision records and model docs
test/               vitest test suite (one file per component above)
```

## Contributing

See the [issue tracker](https://github.com/kajisho5/realtime-media-observatory/issues)
for the prioritized roadmap (P0-P3) and each component's scope,
acceptance criteria, and dependencies. Adapters (Audio, OBS, VST3/AU,
WebRTC, ...) must implement `src/adapter`'s `Adapter` interface rather than
adding system-specific concepts to `src/core` or `src/model`.

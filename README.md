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

Covers the P0 foundation, all of P1, and most of P2/P3 from the
[issue roadmap](https://github.com/kajisho5/realtime-media-observatory/issues).

**Model, Core, and clock (#1-#3, #9, #10)**

- **Common Measurement Model** (`src/model`) — canonical pipeline/stage/
  measurement/provenance schema, JSON Schema validation.
- **Provenance & Confidence Taxonomy** (`src/model/provenance.ts`) — a
  derived measurement's confidence is bounded by its weakest input; see
  [`docs/architecture/provenance-confidence.md`](docs/architecture/provenance-confidence.md).
- **Clock/Timestamp Model** (`src/clock`) — explicit clock domains;
  cross-domain comparison without an explicit offset throws.
- **Clock Drift Detection** (`src/clock/drift.ts`) — least-squares
  offset/drift-rate estimation with a documented confidence rule.
- **Instrumentation Core** (`src/core`) — stage timing, jitter, buffer
  state, drop/XRUN counters, bounded rolling windows for live metrics
  (`rolling.ts`), a self-benchmark for the Core's own overhead
  (`overhead.ts`). No adapter-specific code — enforced by `npm run
  check:core-purity` in CI.

**Adapters (#4, #5, #11-#14, #20)**

- **Adapter Interface** (`src/adapter/types.ts`) — the formal contract,
  plus a reference `ExampleAdapter`.
- **Synthetic Pipeline** (`src/synthetic`) — deterministic, hardware-free
  fixtures with known expected latency, used by CI.
- **Network Adapter** (`src/adapter/networkAdapter.ts`) — real TCP
  connect-RTT measurement against any reachable host. Verified against a
  real external host (`realtime-observe probe-network`).
- **OBS Adapter** (`src/adapter/obsAdapter.ts`) — obs-websocket v5
  protocol client (Hello/Identify/Identified handshake, `GetStats`
  polling). Protocol-tested against a mock server; **not yet verified
  against a real OBS Studio instance** (needs a desktop GUI environment
  this sandbox doesn't have — see issue #13).
- **VST3/AU local reporting protocol** (`src/adapter/vstAdapter.ts`,
  [`docs/architecture/vst-au-reporting-protocol.md`](docs/architecture/vst-au-reporting-protocol.md))
  — the Node-side listener for the wire protocol a native plugin would
  speak, tested with a real TCP client. **The native VST3/AU plugin
  itself is not implemented** — that needs a C++/VST3 SDK/DAW build this
  environment doesn't have (issue #14).
- **Audio Adapter (#11)** — not implemented. This container has no ALSA
  devices at all (checked directly), so there's no real hardware to build
  or verify a platform audio backend against.

**Reporting, graph, and dashboard (#16-#18, #21)**

- **Pipeline Graph Model** (`src/graph`) — `totalLatencyMs()` /
  `latencyContributions()` query helpers over a pipeline's stages.
- **Reporting** (`src/reporting`) — JSON Lines (`stream`), WebSocket
  broadcast (`serve`), Prometheus `/metrics` (`metrics`), and
  OpenTelemetry trace export (`otel`).
- **Dashboard** (`dashboard/`, served by `realtime-observe dashboard`) —
  the pipeline-first web UI from the architecture spec: total latency,
  stage chain, jitter/drops/XRUN/clock-drift, measurement method and
  confidence. Verified end-to-end with a real headless-browser session
  against a running `serve` instance.

**Calibration and validation (#12, #15)**

- **Measurement Calibration** (`src/calibration`) — known-delay reference
  calibration against the Synthetic Harness; see
  [`docs/architecture/calibration.md`](docs/architecture/calibration.md).
- **Real Hardware Validation** — a documented procedure/template
  ([`docs/architecture/real-hardware-validation.md`](docs/architecture/real-hardware-validation.md)),
  **not a completed run** — this environment has no audio interface,
  camera, or display to run it against (issue #15).

**Not implemented**: a real Audio Adapter, a native VST3/AU plugin
binary, WebRTC adapter (#19), and end-to-end verification of the OBS
Adapter against real OBS. Each needs an environment with the actual
hardware/software (a real audio interface, a DAW + C++/VST3 toolchain, a
browser doing real peer connections, or a running OBS Studio instance) to
build and verify against — see the linked issues for what's needed to
pick them up. This project would rather leave something honestly
unstarted than ship adapter/protocol code that has never run against the
real system it targets.

## Quickstart

```bash
npm install
npm run build
npx realtime-observe run              # human-readable pipeline report
npx realtime-observe run --json       # machine-readable, CMM-schema-valid JSON
npx realtime-observe run --pipeline audio-round-trip
npx realtime-observe list             # list available synthetic fixtures
npx realtime-observe stream --interval-ms 500       # NDJSON to stdout, Ctrl+C to stop
npx realtime-observe serve --port 8787              # WebSocket broadcast server, Ctrl+C to stop
npx realtime-observe dashboard --port 8080          # web dashboard + WebSocket server, Ctrl+C to stop
npx realtime-observe metrics --port 9464            # Prometheus /metrics endpoint, Ctrl+C to stop
npx realtime-observe otel                           # export one pipeline run as an OTel trace to the console
npx realtime-observe probe-network --host example.com --port 443   # real TCP RTT to a real host
npx realtime-observe obs --url ws://localhost:4455  # connect to a running OBS instance (obs-websocket v5)
npx realtime-observe vst-listen --port 9400          # wait for one VST3/AU plugin report (see scripts/demo-vst-client.mjs)
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
  model/        Common Measurement Model: types, JSON Schema, validation, provenance
  clock/        Clock domains, ClockOffset/drift, guarded cross-domain diff, drift estimation
  core/         Instrumentation Core: stage timing, jitter, buffer, counters, rolling metrics, overhead benchmark
  adapter/      Adapter interface, ExampleAdapter, Network/OBS/VST adapters
  synthetic/    Deterministic test fixtures + the pipeline runner
  calibration/  Known-delay reference calibration
  graph/        Pipeline Graph Model
  reporting/    JSON Lines, WebSocket, Prometheus, OpenTelemetry
  cli/          `realtime-observe` entry point + dashboard static file server
dashboard/          Static pipeline-first web dashboard (served by `realtime-observe dashboard`)
docs/architecture/  Architecture decision records and model docs
scripts/            check-core-purity.mjs (CI), demo-vst-client.mjs (manual testing)
test/               vitest test suite (one file per component above)
```

## Contributing

See the [issue tracker](https://github.com/kajisho5/realtime-media-observatory/issues)
for the prioritized roadmap (P0-P3) and each component's scope,
acceptance criteria, and dependencies. Adapters (Audio, OBS, VST3/AU,
WebRTC, ...) must implement `src/adapter`'s `Adapter` interface rather than
adding system-specific concepts to `src/core` or `src/model`.

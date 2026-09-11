# VST3/AU Local Reporting Protocol

Related: [Issue #14](https://github.com/kajisho5/realtime-media-observatory/issues/14)

## Status

This document specifies the wire protocol a VST3/AU plugin would use to
report into the Observatory, and `src/adapter/vstAdapter.ts` implements
and tests the **Node-side listener** for it (real TCP, real JSON,
verified in `test/vstAdapter.test.ts`). The **native VST3/AU plugin
itself is not implemented** — building one needs a C++ toolchain, the
Steinberg VST3 SDK (and/or Apple's Audio Unit SDK), and a DAW to host and
verify it in, none of which this sandboxed environment has. That native
build is real, separate work; what's here is the protocol design and the
side of it a Node process can actually run and be tested against, so the
native plugin has a concrete, working target to report into once someone
builds it.

## Why not build the native plugin?

Per the roadmap: "Do NOT build a new audio engine. Do NOT make VST the
foundation of the project. VST3/AU is an integration surface over the
generic instrumentation model." Consistent with that, and with not
shipping unverifiable code (see
[Real Hardware Validation](./real-hardware-validation.md)'s reasoning),
the plugin binary itself is left for an environment with a DAW and a
C++/VST3 build toolchain. This document and the listener below make that
future work well-defined rather than open-ended.

## Transport

Plain TCP, localhost only (the plugin and the Observatory run on the same
machine, inside the same DAW host process's environment). One JSON object
per line (newline-delimited JSON), UTF-8. The listener is intentionally
simple — no framing beyond newlines, no compression, no TLS — because the
plugin and Observatory are always co-located.

Default port: `9400` (arbitrary, configurable via `--port` on
`realtime-observe vst-listen`).

## Message: `report`

Sent by the plugin once per reporting interval (e.g. once per processing
block, or downsampled to ~1/sec — the plugin's choice; the protocol
doesn't mandate a rate).

```json
{
  "type": "report",
  "sampleRate": 48000,
  "bufferSize": 128,
  "inputLatencyMs": 2.5,
  "processingLatencyMs": 1.5,
  "outputLatencyMs": 2.5,
  "xrun": false
}
```

| Field | Type | Meaning |
|---|---|---|
| `type` | `"report"` | Fixed discriminator. |
| `sampleRate` | number | Host sample rate, Hz. |
| `bufferSize` | number | Host buffer size, samples. |
| `inputLatencyMs` | number | Input-stage latency, ms. |
| `processingLatencyMs` | number | Plugin processing latency, ms. |
| `outputLatencyMs` | number | Output-stage latency, ms. |
| `xrun` | boolean (optional) | Whether an XRUN occurred since the last report. |

Round-trip latency is `inputLatencyMs + processingLatencyMs +
outputLatencyMs` — the Observatory computes this itself via
`total_latency_ms` (see the
[Common Measurement Model](./common-measurement-model.md)) rather than
having the plugin pre-sum it, for the same reason every derived value in
this project is computed once, in one place.

Validation: `src/adapter/vstReportingProtocol.ts`'s `isVstPluginReport()`
is the single source of truth for what counts as a valid message; a line
that fails validation (wrong shape, not JSON, or an unrecognized `type`)
is silently dropped by the listener rather than crashing the connection —
a malformed report from a plugin under active development shouldn't take
down the Observatory session.

## Node-side listener (`VstPluginAdapter`)

Implements the [Adapter Interface](./common-measurement-model.md):
`report.inputLatencyMs` / `processingLatencyMs` / `outputLatencyMs`
become `stage_start`/`stage_end` events for stages `input`, `processing`,
`output` respectively (chained sequentially so their `latency_ms`
measurements sum to the correct round-trip total); `xrun: true` becomes
an `xrun` AdapterEvent.

```ts
import { VstPluginAdapter } from "./src/adapter/vstAdapter.js";
import { runPipelineToCMM } from "./src/synthetic/runPipeline.js";

const adapter = new VstPluginAdapter({ port: 9400 });
const port = await adapter.listen(); // call before connecting a plugin client if the port matters
const pipeline = await runPipelineToCMM(adapter, "vst-plugin"); // waits for one report by default
```

## Trying it manually

`scripts/demo-vst-client.mjs` is a minimal stand-in for a real plugin — a
plain Node script that connects and sends one `report` message — useful
for manually exercising `realtime-observe vst-listen` end-to-end without
a real DAW:

```bash
# terminal 1
npx tsx src/cli/index.ts vst-listen --port 9400

# terminal 2, once terminal 1 prints "waiting for..."
node scripts/demo-vst-client.mjs --port 9400
```

## Future work

- A persistent/streaming listener mode (parallel to `realtime-observe
  serve`) for a live DAW session reporting continuously, rather than the
  current one-shot "wait for one report" mode used by `run`-style CLI
  commands.
- The actual VST3 (and AU) native plugin, once built in an environment
  with the required toolchain and a DAW to verify against — see
  [Real Hardware Validation](./real-hardware-validation.md) for the same
  "don't fake verification" reasoning applied to plugin hosting.

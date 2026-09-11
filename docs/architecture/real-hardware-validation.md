# Real Hardware Validation

Related: [Issue #15](https://github.com/kajisho5/realtime-media-observatory/issues/15)

Status: **procedure documented, no run recorded yet.** This is a template
and checklist, not a completed validation. It was written from a
sandboxed, headless development container with no audio interface,
camera, or display attached — see "Why this is a template, not a
result" below. Running it and recording a result requires an environment
with the actual hardware.

## Purpose

The [Synthetic Pipeline Test Harness](./common-measurement-model.md) and
[Measurement Calibration](./calibration.md) (#12) prove the
Instrumentation Core computes latency correctly from *given* timing data.
Neither proves the Observatory measures *real* timing correctly once a
concrete Adapter reads from actual hardware (a USB audio interface, a
camera, a display). That is what this procedure is for, and per the
roadmap it is deliberately kept **separate from CI** — it is a manual,
periodic exercise, not something that runs on every push.

## Scope

Three independent checks, each producing a comparable, dated record:

1. Audio loopback (USB audio interface)
2. Camera capture latency
3. Display/render latency

Each check below follows the same shape: **setup → procedure → what to
record → pass/fail criteria**.

---

## 1. Audio loopback validation

**Setup**

- A USB audio interface with at least one line/instrument output routed
  directly back into a line input (a physical patch cable — the same
  loopback technique used by tools like RTL Utility / MathAudio Latency
  Meter, referenced in the roadmap's competitive check).
- Fixed, documented sample rate and buffer size (e.g. 48 kHz / 128
  samples) — record both; latency scales with buffer size, so a result is
  only comparable to another run at the same settings.
- The Observatory's Audio Adapter (#11) connected to that interface.

**Procedure**

1. Start the Audio Adapter observing the interface.
2. Emit a sharp, known impulse (a single-sample click, or a short burst)
   on the output routed to the loopback input.
3. Record the Adapter-reported round-trip latency for that impulse.
4. Repeat at least 20 times; discard the first 2 (warm-up).

**Record**

- Sample rate, buffer size, interface make/model, driver (ASIO/Core
  Audio/WASAPI/ALSA + version).
- Mean, min, max, and standard deviation of the 18 measured round-trip
  latencies, in ms.
- The theoretical minimum round-trip latency for the given buffer
  size/sample rate (`2 × buffer_size / sample_rate × 1000` ms as a rough
  floor for a simple in→out loopback), for comparison.

**Pass/fail**

- Fail if standard deviation exceeds 10% of the mean (unstable
  measurement — investigate before trusting the mean).
- Fail if the mean is below the theoretical floor (physically impossible
  — indicates a measurement bug, not real hardware performance).
- Otherwise record the result; there is no fixed "good" latency number —
  what matters is that the Observatory's reported value is internally
  consistent and physically plausible.

---

## 2. Camera capture latency validation

**Setup**

- A camera connected via the intended capture path (UVC/USB, NDI, HDMI
  capture card, or OBS's own camera source, depending on which Adapter is
  under test).
- A precise, visible time source the camera can film: a millisecond-
  resolution on-screen stopwatch/counter, or an LED flasher circuit with a
  photodiode.
- A second, independent capture of the same time source not going through
  the pipeline under test (e.g. filming the same stopwatch with a phone,
  or the raw feed side-by-side with the processed one), used as ground
  truth.

**Procedure**

1. Start the pipeline (Camera Adapter → Instrumentation Core → CLI/
   dashboard) observing the camera.
2. Point the camera at the time source.
3. At a known moment, capture a frame from the Observatory's own
   monitoring output alongside the ground-truth reference (e.g. a
   simultaneous screenshot/photo of both).
4. Read the time-source value visible in each and compute the difference
   — that's the true glass-to-glass delay for that stage of the pipeline.
5. Compare against the Observatory's own reported capture-stage latency
   for the same moment.
6. Repeat at least 10 times across the session (camera performance can
   drift with thermal/exposure changes).

**Record**

- Camera make/model, resolution, frame rate, connection type.
- Ground-truth measured delay (ms) vs Observatory-reported capture
  latency (ms), per trial, and the difference.
- Lighting/exposure conditions (capture latency for some cameras varies
  with auto-exposure hunting).

**Pass/fail**

- Fail if the Observatory's reported value differs from ground truth by
  more than one frame interval (`1000 / fps` ms) — that's a full frame of
  unaccounted error, larger than reasonable measurement noise.
- Otherwise record the actual difference as this camera/adapter's
  measured accuracy; do not round it up to "accurate" without the number.

---

## 3. Display/render latency validation

**Setup**

- A display or capture path (the monitor/output the pipeline renders to,
  or a capture card recording that output) with a known, stable refresh
  rate.
- The same visible time-source technique as camera validation, but now
  measuring from "pipeline says frame N was rendered at time T" to "frame
  N actually appeared on the display."
- A high-frame-rate camera (120fps+) or a photodiode + oscilloscope for
  sub-frame precision, since display/render latency is often smaller than
  one video frame interval and a normal-frame-rate camera can't resolve
  it.

**Procedure**

1. Drive a known test pattern (e.g. a full-screen flash) through the
   pipeline at a recorded trigger time.
2. Capture the moment the flash actually appears on the display with the
   high-frame-rate camera or photodiode.
3. Compute the delay between trigger time and observed appearance.
4. Compare against the Observatory's own reported render-stage latency.
5. Repeat at least 10 times.

**Record**

- Display make/model, refresh rate, connection (HDMI/DP/capture card
  model), any scaling/processing in the signal path (a TV's own
  post-processing can add tens of ms independent of the pipeline under
  test — note if present and, if possible, disable it for this test).
- Ground-truth measured delay vs Observatory-reported render latency, per
  trial.

**Pass/fail**

- Same rule as camera validation: fail if the difference exceeds one
  display refresh interval.

---

## Result record template

Copy this block per completed run and commit it under
`docs/architecture/validation-runs/<date>-<short-description>.md` (create
the directory on the first real run):

```markdown
# Real Hardware Validation Run — <YYYY-MM-DD>

## Environment
- Operator:
- Location/setup:

## 1. Audio loopback
- Interface / driver:
- Sample rate / buffer size:
- Trials: n=
- Mean / min / max / stddev (ms):
- Theoretical floor (ms):
- Pass/fail:

## 2. Camera capture
- Camera / connection:
- Resolution / fps:
- Trials: n=
- Ground truth vs reported (ms), per trial:
- Pass/fail:

## 3. Display/render
- Display / connection:
- Refresh rate:
- Trials: n=
- Ground truth vs reported (ms), per trial:
- Pass/fail:

## Notes / anomalies
```

## Why this is a template, not a result

This document was written in a sandboxed development container with:

- no `/proc/asound` entries (no ALSA devices — checked directly),
- no camera device,
- no attached display,
- Audio Adapter (#11) itself not implemented for the same reason.

Producing a "completed run" here would mean fabricating numbers — exactly
what this project's own architecture (see
[the AI Agent Boundary ADR](./ai-agent-boundary.md) and
[Provenance & Confidence Taxonomy](./provenance-confidence.md)) exists to
prevent: never presenting an unmeasured value as a fact. The procedure
above is real and ready to run; the first completed record should come
from an environment with the actual interface/camera/display — e.g. a
SEVENTHWELL on-site rig — using this template.

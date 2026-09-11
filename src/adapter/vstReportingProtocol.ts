/**
 * VST3/AU local reporting protocol.
 *
 * The wire format a VST3/AU plugin (running inside a DAW host process)
 * would speak to report into the Observatory over a local TCP connection.
 * See docs/architecture/vst-au-reporting-protocol.md for the full spec
 * and rationale. This module only defines/validates the message shape;
 * the native plugin itself is out of scope for this repository (#14) —
 * it needs a C++/VST3 SDK/DAW build this environment doesn't have.
 */

export interface VstPluginReport {
  readonly type: "report";
  readonly sampleRate: number;
  readonly bufferSize: number;
  readonly inputLatencyMs: number;
  readonly processingLatencyMs: number;
  readonly outputLatencyMs: number;
  readonly xrun?: boolean;
}

export function isVstPluginReport(value: unknown): value is VstPluginReport {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v["type"] === "report" &&
    typeof v["sampleRate"] === "number" &&
    typeof v["bufferSize"] === "number" &&
    typeof v["inputLatencyMs"] === "number" &&
    typeof v["processingLatencyMs"] === "number" &&
    typeof v["outputLatencyMs"] === "number" &&
    (v["xrun"] === undefined || typeof v["xrun"] === "boolean")
  );
}

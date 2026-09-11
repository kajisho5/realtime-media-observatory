/**
 * Reporting: OpenTelemetry trace export.
 *
 * Maps a Common Measurement Model Pipeline onto an OTel trace: one root
 * span per pipeline run, one child span per stage carrying its latency
 * and provenance/confidence as span attributes. Traces (rather than
 * metrics) are the natural fit here — a Pipeline report is inherently a
 * single, structured "operation" (the pipeline run) made of ordered
 * sub-operations (its stages), which is exactly what a trace represents.
 */
import { SpanStatusCode, context, trace, type Tracer } from "@opentelemetry/api";
import type { Pipeline } from "../model/types.js";

export const INSTRUMENTATION_NAME = "realtime-media-observatory";

/**
 * Exports one Pipeline as an OTel trace via the given (or globally
 * registered) Tracer. Stage spans are sequenced using each stage's own
 * `latency_ms` as its duration, chained end-to-start starting from the
 * call time — this reconstructs the pipeline's relative timing even
 * though the CMM itself doesn't carry OTel-native start/end timestamps.
 */
export function exportPipelineAsSpans(pipeline: Pipeline, tracer: Tracer = trace.getTracer(INSTRUMENTATION_NAME)): void {
  const rootStartMs = Date.now();
  const rootSpan = tracer.startSpan(`pipeline:${pipeline.name}`, {
    startTime: rootStartMs,
    attributes: {
      "rmo.pipeline.id": pipeline.id,
      "rmo.pipeline.schema_version": pipeline.schemaVersion,
      "rmo.total_latency_ms": pipeline.totalLatencyMeasurement?.value ?? 0,
      "rmo.jitter_ms": pipeline.jitterMeasurement?.value ?? 0,
      "rmo.drops_total": pipeline.dropsMeasurement?.value ?? 0,
      "rmo.xrun_total": pipeline.xrunMeasurement?.value ?? 0
    }
  });

  const parentContext = trace.setSpan(context.active(), rootSpan);
  let cursorMs = rootStartMs;

  for (const stage of pipeline.stages) {
    const latency = stage.measurements.find((m) => m.name === "latency_ms");
    const durationMs = latency?.value ?? 0;
    const stageSpan = tracer.startSpan(
      `stage:${stage.name}`,
      {
        startTime: cursorMs,
        attributes: {
          "rmo.stage.id": stage.id,
          "rmo.stage.latency_ms": durationMs,
          "rmo.measurement.method": latency?.provenance.method ?? "unknown",
          "rmo.measurement.confidence": latency?.provenance.confidence ?? "unknown"
        }
      },
      parentContext
    );
    cursorMs += durationMs;
    stageSpan.setStatus({ code: SpanStatusCode.OK });
    stageSpan.end(cursorMs);
  }

  rootSpan.setStatus({ code: SpanStatusCode.OK });
  rootSpan.end(cursorMs);
}

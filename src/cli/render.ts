/**
 * Human-readable, pipeline-first renderer for `realtime-observe`.
 *
 * Design intent (see docs/architecture/ai-agent-boundary.md and the
 * project roadmap): show the pipeline shape and total latency at a glance,
 * never a log dump, and never a diagnosis ("network is the problem") —
 * only measured/derived facts with their confidence.
 */
import type { Measurement, Pipeline } from "../model/types.js";

function fmt(m: Measurement | undefined, digits = 1): string {
  if (!m) return "n/a";
  const value = m.unit === "ms" || m.unit === "ms_per_s" ? m.value.toFixed(digits) : String(m.value);
  const suffix = m.unit === "ms" ? "ms" : m.unit === "percent" ? "%" : m.unit === "ms_per_s" ? "ms/s" : "";
  return `${value}${suffix}`;
}

export function renderHuman(pipeline: Pipeline): string {
  const lines: string[] = [];
  lines.push(`REALTIME MEDIA OBSERVATORY — ${pipeline.name}`);
  lines.push("");
  lines.push(`  TOTAL LATENCY   ${fmt(pipeline.totalLatencyMeasurement)}`);
  lines.push(`  JITTER          ${fmt(pipeline.jitterMeasurement)}`);
  lines.push(`  DROPPED         ${fmt(pipeline.dropsMeasurement, 0)}`);
  lines.push(`  XRUN            ${fmt(pipeline.xrunMeasurement, 0)}`);
  if (pipeline.clockDriftMeasurement) {
    lines.push(`  CLOCK DRIFT     ${fmt(pipeline.clockDriftMeasurement)}`);
  }
  lines.push("");
  lines.push("  PIPELINE");
  for (const stage of pipeline.stages) {
    const latency = stage.measurements.find((m) => m.name === "latency_ms");
    lines.push(`    ${stage.name.padEnd(14)} ${fmt(latency)}`);
  }
  lines.push("");
  const confidence = pipeline.totalLatencyMeasurement?.provenance.confidence ?? "n/a";
  const method = pipeline.totalLatencyMeasurement?.provenance.method ?? "n/a";
  lines.push(`  measurement: ${method}   confidence: ${confidence}`);
  return lines.join("\n");
}

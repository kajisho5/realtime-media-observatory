/**
 * Reporting: Prometheus text exposition format.
 * https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md
 */
import type { Measurement, Pipeline } from "../model/types.js";

interface Sample {
  readonly labels: Record<string, string>;
  readonly value: number;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(",")}}`;
}

function metricBlock(name: string, help: string, type: "gauge" | "counter", samples: readonly Sample[]): string | undefined {
  if (samples.length === 0) return undefined;
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...samples.map((s) => `${name}${formatLabels(s.labels)} ${s.value}`)];
  return lines.join("\n");
}

function stageLatencySamples(pipeline: Pipeline): Sample[] {
  const samples: Sample[] = [];
  for (const stage of pipeline.stages) {
    const latency: Measurement | undefined = stage.measurements.find((m) => m.name === "latency_ms");
    if (latency) samples.push({ labels: { pipeline: pipeline.name, stage: stage.name }, value: latency.value });
  }
  return samples;
}

/** Renders a Pipeline as Prometheus text exposition format (one metric family per CMM measurement). */
export function toPrometheusExposition(pipeline: Pipeline): string {
  const pipelineLabel = { pipeline: pipeline.name };
  const blocks: string[] = [];

  const add = (block: string | undefined): void => {
    if (block) blocks.push(block);
  };

  add(metricBlock("rmo_total_latency_ms", "Total pipeline latency, in milliseconds.", "gauge", pipeline.totalLatencyMeasurement ? [{ labels: pipelineLabel, value: pipeline.totalLatencyMeasurement.value }] : []));
  add(metricBlock("rmo_jitter_ms", "Pipeline latency jitter (sample standard deviation), in milliseconds.", "gauge", pipeline.jitterMeasurement ? [{ labels: pipelineLabel, value: pipeline.jitterMeasurement.value }] : []));
  add(metricBlock("rmo_drops_total", "Cumulative dropped frames/samples.", "counter", pipeline.dropsMeasurement ? [{ labels: pipelineLabel, value: pipeline.dropsMeasurement.value }] : []));
  add(metricBlock("rmo_xrun_total", "Cumulative XRUN (underrun/overrun) events.", "counter", pipeline.xrunMeasurement ? [{ labels: pipelineLabel, value: pipeline.xrunMeasurement.value }] : []));
  add(metricBlock("rmo_buffer_percent", "Buffer fill level, percent.", "gauge", pipeline.bufferMeasurement ? [{ labels: pipelineLabel, value: pipeline.bufferMeasurement.value }] : []));
  add(metricBlock("rmo_clock_drift_ms_per_sec", "Estimated clock drift, milliseconds per second.", "gauge", pipeline.clockDriftMeasurement ? [{ labels: pipelineLabel, value: pipeline.clockDriftMeasurement.value }] : []));
  add(metricBlock("rmo_stage_latency_ms", "Per-stage latency, in milliseconds.", "gauge", stageLatencySamples(pipeline)));

  return `${blocks.join("\n\n")}\n`;
}

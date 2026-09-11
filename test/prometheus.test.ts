import { describe, expect, it } from "vitest";
import { toPrometheusExposition } from "../src/reporting/prometheus.js";
import { startPrometheusServer, type PrometheusHttpServer } from "../src/reporting/prometheusServer.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, runPipelineToCMM } from "../src/synthetic/index.js";

async function samplePipeline() {
  const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "camera-to-display")!;
  return runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
}

// Minimal structural check for Prometheus text exposition format:
// https://github.com/prometheus/docs/blob/main/content/docs/instrumenting/exposition_formats.md
const HELP_LINE = /^# HELP [a-zA-Z_:][a-zA-Z0-9_:]* .+$/;
const TYPE_LINE = /^# TYPE [a-zA-Z_:][a-zA-Z0-9_:]* (gauge|counter)$/;
const SAMPLE_LINE = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? -?[0-9.eE+-]+$/;

function assertValidExposition(text: string): void {
  const blocks = text.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n");
    expect(lines[0]).toMatch(HELP_LINE);
    expect(lines[1]).toMatch(TYPE_LINE);
    for (const sampleLine of lines.slice(2)) {
      expect(sampleLine).toMatch(SAMPLE_LINE);
    }
  }
}

describe("toPrometheusExposition", () => {
  it("produces a well-formed exposition document", async () => {
    const pipeline = await samplePipeline();
    const text = toPrometheusExposition(pipeline);
    assertValidExposition(text);
  });

  it("includes the total latency as a gauge with the pipeline label", async () => {
    const pipeline = await samplePipeline();
    const text = toPrometheusExposition(pipeline);
    expect(text).toContain("# TYPE rmo_total_latency_ms gauge");
    expect(text).toContain(`rmo_total_latency_ms{pipeline="camera-to-display"} 38`);
  });

  it("includes one rmo_stage_latency_ms sample per stage, labeled by stage name", async () => {
    const pipeline = await samplePipeline();
    const text = toPrometheusExposition(pipeline);
    expect(text).toContain('rmo_stage_latency_ms{pipeline="camera-to-display",stage="capture"} 10');
    expect(text).toContain('rmo_stage_latency_ms{pipeline="camera-to-display",stage="network"} 20');
  });

  it("escapes label values containing quotes", () => {
    const pipeline = {
      schemaVersion: "0.1.0",
      id: "p1",
      name: 'weird"name',
      stages: [],
      totalLatencyMeasurement: {
        id: "m1",
        name: "total_latency_ms",
        value: 1,
        unit: "ms" as const,
        provenance: { kind: "measured" as const, method: "timestamp", confidence: "high" as const }
      },
      generatedAt: new Date().toISOString()
    };
    const text = toPrometheusExposition(pipeline);
    expect(text).toContain('pipeline="weird\\"name"');
  });
});

describe("startPrometheusServer", () => {
  let server: PrometheusHttpServer | undefined;

  it("serves the latest pipeline as Prometheus exposition at /metrics", async () => {
    const pipeline = await samplePipeline();
    server = await startPrometheusServer(0, () => pipeline);
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    assertValidExposition(text);
    await server.close();
    server = undefined;
  });

  it("returns 503 before any pipeline has been supplied", async () => {
    server = await startPrometheusServer(0, () => undefined);
    const res = await fetch(server.url);
    expect(res.status).toBe(503);
    await server.close();
    server = undefined;
  });

  it("404s any path other than /metrics", async () => {
    const pipeline = await samplePipeline();
    server = await startPrometheusServer(0, () => pipeline);
    const res = await fetch(server.url.replace("/metrics", "/other"));
    expect(res.status).toBe(404);
    await server.close();
    server = undefined;
  });
});

import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { beforeEach, describe, expect, it } from "vitest";
import { exportPipelineAsSpans } from "../src/reporting/opentelemetry.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, runPipelineToCMM } from "../src/synthetic/index.js";

async function samplePipeline() {
  const spec = SYNTHETIC_FIXTURES.find((f) => f.id === "camera-to-display")!;
  return runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
}

describe("exportPipelineAsSpans", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  });

  it("emits one root pipeline span and one child span per stage, correctly parented", async () => {
    const pipeline = await samplePipeline();
    exportPipelineAsSpans(pipeline, provider.getTracer("test"));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1 + pipeline.stages.length); // root + one per stage

    const root = spans.find((s) => s.name === `pipeline:${pipeline.name}`);
    expect(root).toBeDefined();
    expect(root!.attributes["rmo.total_latency_ms"]).toBe(38);

    const stageSpans = spans.filter((s) => s.name.startsWith("stage:"));
    expect(stageSpans).toHaveLength(pipeline.stages.length);
    for (const span of stageSpans) {
      expect(span.parentSpanContext?.spanId).toBe(root!.spanContext().spanId);
    }

    const captureSpan = stageSpans.find((s) => s.name === "stage:capture");
    expect(captureSpan!.attributes["rmo.stage.latency_ms"]).toBe(10);
    expect(captureSpan!.attributes["rmo.measurement.method"]).toBe("timestamp");
    expect(captureSpan!.attributes["rmo.measurement.confidence"]).toBe("high");
  });

  it("sequences stage span start times monotonically, matching stage order", async () => {
    const pipeline = await samplePipeline();
    exportPipelineAsSpans(pipeline, provider.getTracer("test"));

    const stageSpans = exporter
      .getFinishedSpans()
      .filter((s) => s.name.startsWith("stage:"))
      .sort((a, b) => a.startTime[0] - b.startTime[0] || a.startTime[1] - b.startTime[1]);

    expect(stageSpans.map((s) => s.name)).toEqual(["stage:capture", "stage:buffer", "stage:processing", "stage:network"]);
  });
});

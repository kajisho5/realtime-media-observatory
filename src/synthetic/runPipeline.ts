/**
 * Drives any Adapter's events through the Instrumentation Core and returns
 * a Common-Measurement-Model Pipeline. This is what the CLI (#6) uses to
 * turn an Adapter into `realtime-observe` output, and what the synthetic
 * fixtures use to prove the Core computes correct numbers.
 */
import type { Adapter, AdapterEvent } from "../adapter/types.js";
import { BufferTracker, EventCounter, StageRecorder, jitterMeasurement, nextId, totalLatency } from "../core/index.js";
import type { Measurement, Pipeline, Stage } from "../model/types.js";

export async function runPipelineToCMM(adapter: Adapter, pipelineName: string): Promise<Pipeline> {
  const recorder = new StageRecorder();
  const dropCounter = new EventCounter("drop_count");
  const xrunCounter = new EventCounter("xrun_count");
  const buffer = new BufferTracker();
  const stageOrder: string[] = [];
  const stageLatencies = new Map<string, Measurement>();

  adapter.onEvent((event: AdapterEvent) => {
    switch (event.kind) {
      case "stage_start":
        if (!stageOrder.includes(event.stageId)) stageOrder.push(event.stageId);
        recorder.start(event.stageId, event.timestamp);
        break;
      case "stage_end": {
        const latency = recorder.end(event.stageId, event.timestamp);
        stageLatencies.set(event.stageId, latency);
        break;
      }
      case "drop":
        dropCounter.increment();
        break;
      case "xrun":
        xrunCounter.increment();
        break;
      case "buffer":
        if (event.value !== undefined) buffer.set(event.value);
        break;
    }
  });

  await adapter.connect();
  await adapter.disconnect();

  const stages: Stage[] = stageOrder.map((stageId) => {
    const latency = stageLatencies.get(stageId);
    return {
      id: stageId,
      name: stageId,
      measurements: latency ? [latency] : []
    };
  });

  const latencies = [...stageLatencies.values()];
  const total = totalLatency(latencies);
  const jitter = jitterMeasurement(latencies);

  return {
    schemaVersion: "0.1.0",
    id: nextId("pipeline"),
    name: pipelineName,
    stages,
    totalLatencyMeasurement: total,
    jitterMeasurement: jitter,
    dropsMeasurement: dropCounter.measurement(),
    xrunMeasurement: xrunCounter.measurement(),
    bufferMeasurement: buffer.measurement(),
    generatedAt: new Date().toISOString()
  };
}

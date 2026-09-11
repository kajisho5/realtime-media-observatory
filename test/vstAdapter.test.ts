import { connect as netConnect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { VstPluginAdapter } from "../src/adapter/vstAdapter.js";
import { isVstPluginReport } from "../src/adapter/vstReportingProtocol.js";
import { runPipelineToCMM } from "../src/synthetic/runPipeline.js";
import { validatePipeline } from "../src/model/validate.js";
import type { AdapterEvent } from "../src/adapter/types.js";

function sendReport(port: number, report: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(port, "127.0.0.1", () => {
      socket.write(`${JSON.stringify(report)}\n`, (err) => {
        if (err) reject(err);
        socket.end();
      });
    });
    socket.on("close", () => resolve());
    socket.on("error", reject);
  });
}

const validReport = {
  type: "report",
  sampleRate: 48000,
  bufferSize: 128,
  inputLatencyMs: 2.7,
  processingLatencyMs: 1.4,
  outputLatencyMs: 2.7,
  xrun: false
};

describe("isVstPluginReport", () => {
  it("accepts a well-formed report", () => {
    expect(isVstPluginReport(validReport)).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isVstPluginReport(null)).toBe(false);
    expect(isVstPluginReport({ type: "report" })).toBe(false);
    expect(isVstPluginReport({ ...validReport, type: "other" })).toBe(false);
    expect(isVstPluginReport({ ...validReport, inputLatencyMs: "2.7" })).toBe(false);
  });
});

describe("VstPluginAdapter (real TCP client sending the documented protocol)", () => {
  let adapter: VstPluginAdapter | undefined;

  afterEach(async () => {
    await adapter?.disconnect();
    adapter = undefined;
  });

  it("translates one report into input/processing/output stage_start/stage_end pairs", async () => {
    adapter = new VstPluginAdapter({ port: 0 });
    const port = await adapter.listen();
    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const connectPromise = adapter.connect();
    await sendReport(port, validReport);
    await connectPromise;

    expect(events.map((e) => e.stageId)).toEqual(["input", "input", "processing", "processing", "output", "output"]);
    expect(events.map((e) => e.kind)).toEqual([
      "stage_start",
      "stage_end",
      "stage_start",
      "stage_end",
      "stage_start",
      "stage_end"
    ]);

    const inputDuration = events[1]!.timestamp.valueMs - events[0]!.timestamp.valueMs;
    expect(inputDuration).toBeCloseTo(2.7, 6);
  });

  it("emits an xrun event when the report says xrun: true", async () => {
    adapter = new VstPluginAdapter({ port: 0 });
    const port = await adapter.listen();
    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const connectPromise = adapter.connect();
    await sendReport(port, { ...validReport, xrun: true });
    await connectPromise;

    expect(events.filter((e) => e.kind === "xrun")).toHaveLength(1);
  });

  it("silently drops a malformed line instead of crashing the listener", async () => {
    adapter = new VstPluginAdapter({ port: 0, reportsPerConnectExpected: 0 });
    const port = await adapter.listen();
    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    await adapter.connect(); // reportsPerConnectExpected: 0 -> resolves once listening
    await sendReport(port, { type: "not-a-report" });
    await sendReport(port, validReport);

    // give the second (valid) report a moment to be processed
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.length).toBeGreaterThan(0);
  });

  it("produces a schema-valid CMM Pipeline via runPipelineToCMM, with round-trip latency = sum of the three stages", async () => {
    adapter = new VstPluginAdapter({ port: 0 });
    const port = await adapter.listen();

    const pipelinePromise = runPipelineToCMM(adapter, "vst-plugin");
    await sendReport(port, validReport);
    const pipeline = await pipelinePromise;

    expect(validatePipeline(pipeline).valid).toBe(true);
    expect(pipeline.totalLatencyMeasurement!.value).toBeCloseTo(2.7 + 1.4 + 2.7, 6);
  });
});

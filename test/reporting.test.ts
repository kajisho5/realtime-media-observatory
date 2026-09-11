import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { createCollectingJsonLinesEmitter, toJsonLine } from "../src/reporting/jsonLines.js";
import { startPipelineWebSocketServer, type PipelineWebSocketServer } from "../src/reporting/websocketServer.js";
import { validatePipeline } from "../src/model/validate.js";
import { SYNTHETIC_FIXTURES, SyntheticAdapter, runPipelineToCMM } from "../src/synthetic/index.js";

async function samplePipeline() {
  const spec = SYNTHETIC_FIXTURES[0]!;
  return runPipelineToCMM(new SyntheticAdapter(spec), spec.name);
}

describe("JSON Lines reporting", () => {
  it("toJsonLine produces a single-line, schema-valid JSON representation", async () => {
    const pipeline = await samplePipeline();
    const line = toJsonLine(pipeline);
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(validatePipeline(parsed).valid).toBe(true);
  });

  it("createCollectingJsonLinesEmitter accumulates one line per write", async () => {
    const emitter = createCollectingJsonLinesEmitter();
    const pipeline = await samplePipeline();
    emitter.write(pipeline);
    emitter.write(pipeline);
    expect(emitter.lines()).toHaveLength(2);
    expect(JSON.parse(emitter.lines()[0]!).id).toBe(pipeline.id);
  });
});

describe("WebSocket reporting", () => {
  let server: PipelineWebSocketServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("broadcasts a schema-valid Pipeline to a connected client", async () => {
    server = await startPipelineWebSocketServer(0);
    expect(server.port).toBeGreaterThan(0);

    const client = new WebSocket(`ws://localhost:${server.port}`);
    const received = new Promise<unknown>((resolve, reject) => {
      client.once("message", (data) => resolve(JSON.parse(data.toString())));
      client.once("error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });

    // give the server a moment to register the connection before broadcasting
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.clientCount).toBe(1);

    const pipeline = await samplePipeline();
    server.broadcast(pipeline);

    const message = await received;
    expect(validatePipeline(message).valid).toBe(true);
    expect((message as { id: string }).id).toBe(pipeline.id);

    client.close();
  });

  it("broadcast to zero clients does not throw", async () => {
    server = await startPipelineWebSocketServer(0);
    const pipeline = await samplePipeline();
    expect(() => server!.broadcast(pipeline)).not.toThrow();
  });
});

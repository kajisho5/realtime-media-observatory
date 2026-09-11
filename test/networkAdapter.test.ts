import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { NetworkAdapter, NetworkConnectError } from "../src/adapter/networkAdapter.js";
import { runPipelineToCMM } from "../src/synthetic/runPipeline.js";
import { validatePipeline } from "../src/model/validate.js";
import type { AdapterEvent } from "../src/adapter/types.js";

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });
}

describe("NetworkAdapter (real TCP, against a local loopback server)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("emits a matched stage_start/stage_end pair for a successful TCP connect", async () => {
    server = createServer();
    const port = await listen(server);

    const adapter = new NetworkAdapter({ host: "127.0.0.1", port });
    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    await adapter.connect();

    expect(events.map((e) => e.kind)).toEqual(["stage_start", "stage_end"]);
    expect(events[0]!.stageId).toBe("network");
    expect(events[1]!.timestamp.valueMs).toBeGreaterThanOrEqual(events[0]!.timestamp.valueMs);
  });

  it("produces a schema-valid, non-negative latency measurement via runPipelineToCMM", async () => {
    server = createServer();
    const port = await listen(server);

    const adapter = new NetworkAdapter({ host: "127.0.0.1", port });
    const pipeline = await runPipelineToCMM(adapter, "network-probe");

    expect(validatePipeline(pipeline).valid).toBe(true);
    expect(pipeline.totalLatencyMeasurement!.value).toBeGreaterThanOrEqual(0);
    expect(pipeline.stages[0]!.id).toBe("network");
  });

  it("rejects with NetworkConnectError when the target refuses the connection", async () => {
    // Bind a server, grab its port, then close it immediately so the port is (very likely) refused.
    server = createServer();
    const port = await listen(server);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    const adapter = new NetworkAdapter({ host: "127.0.0.1", port, timeoutMs: 2000 });
    await expect(adapter.connect()).rejects.toThrow(NetworkConnectError);
  });
});

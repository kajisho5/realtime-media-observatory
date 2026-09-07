import { WebSocketServer, type WebSocket as WSClient } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { ObsAdapter } from "../src/adapter/obsAdapter.js";
import { runPipelineToCMM } from "../src/synthetic/runPipeline.js";
import { validatePipeline } from "../src/model/validate.js";
import type { AdapterEvent } from "../src/adapter/types.js";

interface CannedStats {
  averageFrameRenderTime: number;
  renderSkippedFrames: number;
  outputSkippedFrames: number;
}

/**
 * Minimal mock of the obs-websocket v5 server handshake + GetStats request,
 * sufficient to exercise ObsAdapter's protocol handling without a real OBS
 * instance. `statsRef` is read fresh on every GetStats request, so a test
 * can mutate it between polls to simulate changing frame-drop counters.
 */
function startMockObsServer(statsRef: { current: CannedStats }): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, () => {
      const address = wss.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;

      wss.on("connection", (ws: WSClient) => {
        ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.0.0", rpcVersion: 1 } }));
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.op === 1) {
            ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
          } else if (msg.op === 6 && msg.d.requestType === "GetStats") {
            ws.send(
              JSON.stringify({
                op: 7,
                d: {
                  requestType: "GetStats",
                  requestId: msg.d.requestId,
                  requestStatus: { result: true, code: 100 },
                  responseData: statsRef.current
                }
              })
            );
          }
        });
      });

      resolve({
        port,
        close: () => new Promise((res, rej) => wss.close((err) => (err ? rej(err) : res())))
      });
    });
  });
}

describe("ObsAdapter (against a mock obs-websocket v5 server)", () => {
  let mock: { port: number; close: () => Promise<void> } | undefined;
  let adapter: ObsAdapter | undefined;

  afterEach(async () => {
    await adapter?.disconnect();
    await mock?.close();
    mock = undefined;
    adapter = undefined;
  });

  it("completes the Hello/Identify/Identified handshake and translates GetStats into render stage_start/stage_end", async () => {
    const statsRef = { current: { averageFrameRenderTime: 7.2, renderSkippedFrames: 0, outputSkippedFrames: 0 } };
    mock = await startMockObsServer(statsRef);
    adapter = new ObsAdapter({ url: `ws://127.0.0.1:${mock.port}`, pollIntervalMs: 60_000 });

    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));
    await adapter.connect();

    const renderEvents = events.filter((e) => e.stageId === "render" && (e.kind === "stage_start" || e.kind === "stage_end"));
    expect(renderEvents.map((e) => e.kind)).toEqual(["stage_start", "stage_end"]);
    const durationMs = renderEvents[1]!.timestamp.valueMs - renderEvents[0]!.timestamp.valueMs;
    expect(durationMs).toBeCloseTo(7.2, 6);
  });

  it("translates new renderSkippedFrames/outputSkippedFrames since the last poll into drop/xrun events", async () => {
    const statsRef = { current: { averageFrameRenderTime: 5, renderSkippedFrames: 2, outputSkippedFrames: 1 } };
    mock = await startMockObsServer(statsRef);
    adapter = new ObsAdapter({ url: `ws://127.0.0.1:${mock.port}`, pollIntervalMs: 60_000 });

    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));
    await adapter.connect();

    expect(events.filter((e) => e.kind === "drop")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "xrun")).toHaveLength(1);
  });

  it("produces a schema-valid CMM Pipeline via runPipelineToCMM", async () => {
    const statsRef = { current: { averageFrameRenderTime: 7.2, renderSkippedFrames: 0, outputSkippedFrames: 0 } };
    mock = await startMockObsServer(statsRef);
    adapter = new ObsAdapter({ url: `ws://127.0.0.1:${mock.port}`, pollIntervalMs: 60_000 });

    const pipeline = await runPipelineToCMM(adapter, "obs-pipeline");
    expect(validatePipeline(pipeline).valid).toBe(true);
    expect(pipeline.stages.find((s) => s.id === "render")).toBeDefined();
  });
});

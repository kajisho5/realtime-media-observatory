/**
 * OBS Adapter: connects to OBS through the obs-websocket v5 protocol
 * (https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
 * and translates `GetStats` responses into AdapterEvents — observing the
 * OBS pipeline from outside OBS's own source/filter plugin model, per the
 * architecture rule that OBS integration must be an Adapter, never a
 * filter the Core or Common Measurement Model knows about.
 *
 * Verification status: this implements and unit-tests the obs-websocket
 * wire protocol (Hello -> Identify -> Identified handshake, GetStats
 * request/response) against a mock server (test/obsAdapter.test.ts). It
 * has not been run against a real OBS Studio instance — that requires a
 * desktop GUI environment this sandboxed container doesn't have. Treat
 * end-to-end verification against real OBS as still open (see roadmap
 * issue #13's acceptance criteria).
 */
import WebSocket from "ws";
import type { Adapter, AdapterEvent, AdapterEventHandler } from "./types.js";

const OBS_CLOCK = { domain: "monotonic", id: "obs-websocket" } as const;

interface ObsWebSocketMessage {
  readonly op: number;
  readonly d?: Record<string, unknown>;
}

export interface ObsAdapterOptions {
  /** obs-websocket server URL, e.g. "ws://localhost:4455". */
  readonly url: string;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
}

export class ObsProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObsProtocolError";
  }
}

interface PendingRequest {
  readonly resolve: (data: Record<string, unknown>) => void;
  readonly reject: (err: Error) => void;
}

/** Shape of the fields this adapter reads from obs-websocket's GetStats response. Other fields are ignored. */
interface ObsStats {
  readonly averageFrameRenderTime?: number;
  readonly renderSkippedFrames?: number;
  readonly outputSkippedFrames?: number;
}

export class ObsAdapter implements Adapter {
  readonly name = "obs";
  private ws?: WebSocket;
  private handlers: AdapterEventHandler[] = [];
  private pollTimer?: NodeJS.Timeout;
  private lastRenderSkipped = 0;
  private lastOutputSkipped = 0;
  private requestSeq = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly options: ObsAdapterOptions) {}

  async connect(): Promise<void> {
    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onConnectError = (err: Error): void => reject(err);
      ws.once("error", onConnectError);
      ws.on("message", (raw: Buffer | string) => {
        this.handleMessage(raw.toString(), () => {
          ws.off("error", onConnectError);
          resolve();
        });
      });
    });

    await this.pollStats();
    const intervalMs = this.options.pollIntervalMs ?? 1000;
    this.pollTimer = setInterval(() => {
      this.pollStats().catch(() => {
        // A single failed poll (e.g. transient OBS hiccup) does not tear
        // down the connection; the next interval tick retries.
      });
    }, intervalMs);
  }

  private handleMessage(raw: string, onIdentified: () => void): void {
    let message: ObsWebSocketMessage;
    try {
      message = JSON.parse(raw) as ObsWebSocketMessage;
    } catch {
      return;
    }
    switch (message.op) {
      case 0: {
        // Hello -> Identify
        const rpcVersion = (message.d?.["rpcVersion"] as number | undefined) ?? 1;
        this.ws!.send(JSON.stringify({ op: 1, d: { rpcVersion, eventSubscriptions: 0 } }));
        break;
      }
      case 2:
        // Identified
        onIdentified();
        break;
      case 7: {
        // RequestResponse
        const requestId = message.d?.["requestId"] as string | undefined;
        const pending = requestId ? this.pending.get(requestId) : undefined;
        if (!pending || !requestId) break;
        this.pending.delete(requestId);
        const status = message.d?.["requestStatus"] as { result?: boolean; comment?: string } | undefined;
        if (status?.result) {
          pending.resolve((message.d?.["responseData"] as Record<string, unknown>) ?? {});
        } else {
          pending.reject(new ObsProtocolError(status?.comment ?? "OBS request failed"));
        }
        break;
      }
      default:
        break;
    }
  }

  private request(requestType: string): Promise<Record<string, unknown>> {
    const timeoutMs = this.options.requestTimeoutMs ?? 5000;
    return new Promise((resolve, reject) => {
      const requestId = `req-${(this.requestSeq += 1)}`;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ObsProtocolError(`OBS request "${requestType}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      this.ws!.send(JSON.stringify({ op: 6, d: { requestType, requestId } }));
    });
  }

  private async pollStats(): Promise<void> {
    const stats = (await this.request("GetStats")) as ObsStats;
    const renderMs = Number(stats.averageFrameRenderTime ?? 0);
    const nowMs = performance.now();

    this.emit({ stageId: "render", kind: "stage_start", timestamp: { clock: OBS_CLOCK, valueMs: nowMs } });
    this.emit({ stageId: "render", kind: "stage_end", timestamp: { clock: OBS_CLOCK, valueMs: nowMs + renderMs } });

    const renderSkipped = Number(stats.renderSkippedFrames ?? 0);
    const outputSkipped = Number(stats.outputSkippedFrames ?? 0);
    const newRenderDrops = Math.max(0, renderSkipped - this.lastRenderSkipped);
    const newOutputDrops = Math.max(0, outputSkipped - this.lastOutputSkipped);
    this.lastRenderSkipped = renderSkipped;
    this.lastOutputSkipped = outputSkipped;

    for (let i = 0; i < newRenderDrops; i += 1) {
      this.emit({ stageId: "render", kind: "drop", timestamp: { clock: OBS_CLOCK, valueMs: nowMs } });
    }
    for (let i = 0; i < newOutputDrops; i += 1) {
      this.emit({ stageId: "encode", kind: "xrun", timestamp: { clock: OBS_CLOCK, valueMs: nowMs } });
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.ws?.close();
    this.handlers = [];
  }

  onEvent(handler: AdapterEventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: AdapterEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

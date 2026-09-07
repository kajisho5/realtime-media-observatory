/**
 * VstPluginAdapter: the Node-side listener a VST3/AU plugin (see
 * vstReportingProtocol.ts) would connect to over local TCP. Accepts
 * newline-delimited JSON reports and translates them into input/
 * processing/output stage AdapterEvents, plus an xrun event when the
 * plugin reports one.
 *
 * This is real, tested code for the listener side of the wire protocol —
 * verified in test/vstAdapter.test.ts with an actual TCP client sending
 * actual JSON, not a mock. What's NOT implemented is the native VST3/AU
 * plugin itself that would be the real-world client (#14): that needs a
 * C++/VST3 SDK/DAW build this environment doesn't have. See
 * scripts/demo-vst-client.mjs for a stand-in you can run manually.
 */
import { createServer, type Server, type Socket } from "node:net";
import type { Adapter, AdapterEvent, AdapterEventHandler } from "./types.js";
import { isVstPluginReport, type VstPluginReport } from "./vstReportingProtocol.js";

const VST_CLOCK = { domain: "monotonic", id: "vst-plugin-reporting" } as const;

export interface VstPluginAdapterOptions {
  /** Port to listen on. 0 = OS-assigned (read back via `.port` after `listen()`). */
  readonly port?: number;
  /** How many reports `connect()` waits for before resolving. Default 1, matching the CLI's one-shot `run` pattern. Pass 0 for a listener that's considered "connected" as soon as it's listening (for a long-lived session driven some other way). */
  readonly reportsPerConnectExpected?: number;
}

export class VstPluginAdapter implements Adapter {
  readonly name = "vst-plugin";
  private server?: Server;
  private listenPromise?: Promise<number>;
  private handlers: AdapterEventHandler[] = [];
  private reportsSeen = 0;
  private reportWaiters: (() => void)[] = [];

  constructor(private readonly options: VstPluginAdapterOptions = {}) {}

  /** Starts listening for plugin connections (idempotent) and resolves with the bound port. Call this before handing the adapter to runPipelineToCMM if you need to know the port ahead of time to connect a client. */
  listen(): Promise<number> {
    if (!this.listenPromise) {
      this.listenPromise = new Promise((resolve, reject) => {
        const server = createServer((socket: Socket) => this.handleConnection(socket));
        server.once("error", reject);
        server.listen(this.options.port ?? 0, () => {
          server.off("error", reject);
          this.server = server;
          resolve(this.port);
        });
      });
    }
    return this.listenPromise;
  }

  async connect(): Promise<void> {
    await this.listen();
    const expected = this.options.reportsPerConnectExpected ?? 1;
    if (expected > 0) {
      await this.waitForReports(expected);
    }
  }

  get port(): number {
    const address = this.server?.address();
    return typeof address === "object" && address !== null ? address.port : 0;
  }

  private waitForReports(count: number): Promise<void> {
    if (this.reportsSeen >= count) return Promise.resolve();
    return new Promise((resolve) => {
      this.reportWaiters.push(() => {
        if (this.reportsSeen >= count) resolve();
      });
    });
  }

  private handleConnection(socket: Socket): void {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) this.handleLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    });
  }

  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!isVstPluginReport(parsed)) return;
    this.translateReport(parsed);
    this.reportsSeen += 1;
    const waiters = this.reportWaiters.splice(0);
    for (const waiter of waiters) waiter();
  }

  private translateReport(report: VstPluginReport): void {
    let cursorMs = performance.now();
    const stages: readonly [string, number][] = [
      ["input", report.inputLatencyMs],
      ["processing", report.processingLatencyMs],
      ["output", report.outputLatencyMs]
    ];
    for (const [stageId, durationMs] of stages) {
      this.emit({ stageId, kind: "stage_start", timestamp: { clock: VST_CLOCK, valueMs: cursorMs } });
      cursorMs += durationMs;
      this.emit({ stageId, kind: "stage_end", timestamp: { clock: VST_CLOCK, valueMs: cursorMs } });
    }
    if (report.xrun) {
      this.emit({ stageId: "processing", kind: "xrun", timestamp: { clock: VST_CLOCK, valueMs: cursorMs } });
    }
  }

  async disconnect(): Promise<void> {
    this.handlers = [];
    const server = this.server;
    this.server = undefined;
    this.listenPromise = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  onEvent(handler: AdapterEventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: AdapterEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

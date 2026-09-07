/**
 * Network Adapter: measures TCP connect round-trip time to a target
 * host:port as a "network" stage. This is a real, verifiable Adapter
 * Interface implementation — no mock/simulated system involved, unlike
 * the OBS Adapter's protocol-level tests — since a TCP handshake against
 * any reachable host is something this environment can genuinely perform.
 */
import { connect as netConnect, type Socket } from "node:net";
import type { Adapter, AdapterEvent, AdapterEventHandler } from "./types.js";

const NETWORK_CLOCK = { domain: "monotonic", id: "network-adapter" } as const;

export interface NetworkAdapterOptions {
  readonly host: string;
  readonly port: number;
  readonly stageId?: string;
  readonly timeoutMs?: number;
}

export class NetworkConnectError extends Error {
  constructor(host: string, port: number, cause: unknown) {
    super(`Failed to connect to ${host}:${port}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NetworkConnectError";
  }
}

export class NetworkAdapter implements Adapter {
  readonly name = "network";
  private handlers: AdapterEventHandler[] = [];

  constructor(private readonly options: NetworkAdapterOptions) {}

  async connect(): Promise<void> {
    const stageId = this.options.stageId ?? "network";
    const timeoutMs = this.options.timeoutMs ?? 5000;
    const startMs = performance.now();
    this.emit({ stageId, kind: "stage_start", timestamp: { clock: NETWORK_CLOCK, valueMs: startMs } });

    await new Promise<void>((resolve, reject) => {
      const socket: Socket = netConnect({ host: this.options.host, port: this.options.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new NetworkConnectError(this.options.host, this.options.port, new Error("timed out")));
      }, timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        socket.end();
        resolve();
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        socket.destroy();
        reject(new NetworkConnectError(this.options.host, this.options.port, err));
      });
    });

    const endMs = performance.now();
    this.emit({ stageId, kind: "stage_end", timestamp: { clock: NETWORK_CLOCK, valueMs: endMs } });
  }

  async disconnect(): Promise<void> {
    this.handlers = [];
  }

  onEvent(handler: AdapterEventHandler): void {
    this.handlers.push(handler);
  }

  private emit(event: AdapterEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

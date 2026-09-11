/**
 * Reference Adapter implementation against a fake external system. Serves
 * as living documentation for adapter authors and as the target of the
 * Adapter conformance tests (test/adapter.test.ts).
 */
import type { Adapter, AdapterEvent, AdapterEventHandler } from "./types.js";

export interface ExampleAdapterOptions {
  /** How many synthetic "stage" events to emit once connected. */
  readonly stageCount?: number;
}

export class ExampleAdapter implements Adapter {
  readonly name = "example";
  private connected = false;
  private handlers: AdapterEventHandler[] = [];
  private readonly stageCount: number;

  constructor(options: ExampleAdapterOptions = {}) {
    this.stageCount = options.stageCount ?? 1;
  }

  async connect(): Promise<void> {
    this.connected = true;
    let clock = 0;
    for (let i = 0; i < this.stageCount; i += 1) {
      const stageId = `fake-stage-${i}`;
      this.emit({
        stageId,
        kind: "stage_start",
        timestamp: { clock: { domain: "monotonic", id: "example" }, valueMs: clock }
      });
      clock += 5;
      this.emit({
        stageId,
        kind: "stage_end",
        timestamp: { clock: { domain: "monotonic", id: "example" }, valueMs: clock }
      });
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.handlers = [];
  }

  onEvent(handler: AdapterEventHandler): void {
    this.handlers.push(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private emit(event: AdapterEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

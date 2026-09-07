/**
 * SyntheticAdapter: implements the Adapter Interface against a fake system
 * whose stage timing is fully controlled and deterministic (no real
 * sleeping). This is the P0 correctness gate for the Instrumentation Core:
 * it exercises the full path Adapter -> Instrumentation Core -> Common
 * Measurement Model with a known expected answer.
 */
import type { Adapter, AdapterEvent, AdapterEventHandler } from "../adapter/types.js";
import type { ClockRef } from "../clock/types.js";
import type { SyntheticPipelineSpec } from "./fixtures.js";

const SYNTHETIC_CLOCK: ClockRef = { domain: "monotonic", id: "synthetic" };

export class SyntheticAdapter implements Adapter {
  readonly name = "synthetic";
  private handlers: AdapterEventHandler[] = [];

  constructor(private readonly spec: SyntheticPipelineSpec) {}

  async connect(): Promise<void> {
    let clockMs = 0;
    for (const stage of this.spec.stages) {
      this.emit({
        stageId: stage.name,
        kind: "stage_start",
        timestamp: { clock: SYNTHETIC_CLOCK, valueMs: clockMs }
      });
      clockMs += stage.delayMs;
      this.emit({
        stageId: stage.name,
        kind: "stage_end",
        timestamp: { clock: SYNTHETIC_CLOCK, valueMs: clockMs }
      });
    }
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

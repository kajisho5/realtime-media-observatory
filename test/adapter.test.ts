import { describe, expect, it } from "vitest";
import { ExampleAdapter } from "../src/adapter/exampleAdapter.js";
import type { AdapterEvent } from "../src/adapter/types.js";

describe("Adapter Interface conformance (ExampleAdapter)", () => {
  it("emits a matched stage_start/stage_end pair per configured stage after connect()", async () => {
    const adapter = new ExampleAdapter({ stageCount: 2 });
    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    await adapter.connect();

    expect(adapter.isConnected()).toBe(true);
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.kind)).toEqual(["stage_start", "stage_end", "stage_start", "stage_end"]);
    for (const event of events) {
      expect(event.timestamp.clock.domain).toBeDefined();
      expect(typeof event.timestamp.valueMs).toBe("number");
    }
  });

  it("stops emitting to handlers after disconnect()", async () => {
    const adapter = new ExampleAdapter({ stageCount: 1 });
    const events: AdapterEvent[] = [];
    adapter.onEvent((e) => events.push(e));
    await adapter.connect();
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    // re-registering after disconnect should still work (handlers array reset)
    adapter.onEvent((e) => events.push(e));
    expect(events).toHaveLength(2);
  });
});

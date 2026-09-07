import type { Measurement } from "../model/types.js";
import { nextId } from "./ids.js";

/** Generic monotonically-increasing event counter, used for drops and XRUN. */
export class EventCounter {
  private count = 0;

  constructor(private readonly measurementName: "drop_count" | "xrun_count") {}

  increment(by = 1): void {
    this.count += by;
  }

  measurement(): Measurement {
    return {
      id: nextId("measurement"),
      name: this.measurementName,
      value: this.count,
      unit: "count",
      provenance: { kind: "measured", method: "counter", confidence: "high" }
    };
  }
}

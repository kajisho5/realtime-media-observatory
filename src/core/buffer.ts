import { measuredProvenance } from "../model/provenance.js";
import type { Measurement } from "../model/types.js";
import { nextId } from "./ids.js";

/** Tracks a single buffer's fill level (0-100%) as reported by an adapter. */
export class BufferTracker {
  private levelPercent = 0;

  set(levelPercent: number): void {
    if (levelPercent < 0 || levelPercent > 100) {
      throw new RangeError(`Buffer level must be within 0-100, got ${levelPercent}`);
    }
    this.levelPercent = levelPercent;
  }

  measurement(): Measurement {
    return {
      id: nextId("measurement"),
      name: "buffer_percent",
      value: this.levelPercent,
      unit: "percent",
      provenance: measuredProvenance("counter")
    };
  }
}

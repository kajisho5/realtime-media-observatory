/**
 * Adapter Interface (Architecture boundary).
 *
 * `External System -> Adapter -> Common Measurement Model`.
 *
 * Every integration (Audio, OBS, VST3, AU, WebRTC, Camera, Network, FFmpeg)
 * must implement this interface rather than talking to the Instrumentation
 * Core or Common Measurement Model with system-specific concepts baked in.
 * Timestamps must be produced through the Clock/Timestamp Model; raw events
 * are reported here and turned into Measurements by the Instrumentation
 * Core.
 */
import type { Timestamp } from "../clock/types.js";

export type AdapterEventKind = "stage_start" | "stage_end" | "drop" | "xrun" | "buffer";

export interface AdapterEvent {
  readonly stageId: string;
  readonly kind: AdapterEventKind;
  readonly timestamp: Timestamp;
  /** Present for "buffer" events (0-100 percent). Ignored for other kinds. */
  readonly value?: number;
}

export type AdapterEventHandler = (event: AdapterEvent) => void;

/**
 * The formal contract every Adapter must implement. Adapters own the
 * lifecycle of connecting to their external system and translating its
 * signals into AdapterEvents; they must not construct Common Measurement
 * Model objects directly (that is the Instrumentation Core's job).
 */
export interface Adapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(handler: AdapterEventHandler): void;
}

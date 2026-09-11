/**
 * Canonical synthetic pipeline fixtures with known, injected stage timing.
 * These are deterministic (no real sleeping / wall-clock waiting) so they
 * run fast and reproducibly in CI without any hardware.
 */
export interface SyntheticStageSpec {
  readonly name: string;
  readonly delayMs: number;
}

export interface SyntheticPipelineSpec {
  readonly id: string;
  readonly name: string;
  readonly stages: readonly SyntheticStageSpec[];
}

export const SYNTHETIC_FIXTURES: readonly SyntheticPipelineSpec[] = [
  {
    id: "camera-to-display",
    name: "camera-to-display",
    stages: [
      { name: "capture", delayMs: 10 },
      { name: "buffer", delayMs: 5 },
      { name: "processing", delayMs: 3 },
      { name: "network", delayMs: 20 }
    ]
    // expected total latency: 10 + 5 + 3 + 20 = 38ms
  },
  {
    id: "obs-glass-to-glass",
    name: "obs-glass-to-glass",
    stages: [
      { name: "capture", delayMs: 8.2 },
      { name: "buffer", delayMs: 4.7 },
      { name: "processing", delayMs: 2.1 },
      { name: "render", delayMs: 7.2 },
      { name: "encode", delayMs: 8.9 },
      { name: "network", delayMs: 31.4 }
    ]
    // expected total latency: 8.2 + 4.7 + 2.1 + 7.2 + 8.9 + 31.4 = 62.5ms
  },
  {
    id: "audio-round-trip",
    name: "audio-round-trip",
    stages: [
      { name: "input", delayMs: 2.5 },
      { name: "processing", delayMs: 1.5 },
      { name: "output", delayMs: 2.5 }
    ]
    // expected total latency: 2.5 + 1.5 + 2.5 = 6.5ms
  }
];

export function expectedTotalLatencyMs(spec: SyntheticPipelineSpec): number {
  return spec.stages.reduce((sum, s) => sum + s.delayMs, 0);
}

export function findFixture(id: string): SyntheticPipelineSpec | undefined {
  return SYNTHETIC_FIXTURES.find((f) => f.id === id);
}

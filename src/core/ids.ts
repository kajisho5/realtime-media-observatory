let counter = 0;

/** Deterministic, monotonically increasing id generator (no crypto RNG — keeps synthetic runs reproducible). */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function resetIdCounter(): void {
  counter = 0;
}

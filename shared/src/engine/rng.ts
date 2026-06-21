/** Minimal injectable RNG so battle/capture logic is deterministic in tests. */
export interface RNG {
  /** Uniform float in [0, 1). */
  next(): number;
}

export const defaultRng: RNG = { next: () => Math.random() };

/** A small deterministic PRNG (mulberry32) for seeded tests / replays. */
export function seededRng(seed: number): RNG {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Inclusive integer in [min, max]. */
export function randInt(rng: RNG, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** True with the given percent chance (0–100). */
export function rollChance(rng: RNG, percent: number): boolean {
  return rng.next() * 100 < percent;
}

export function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

export function weightedPick<T>(rng: RNG, entries: readonly { value: T; weight: number }[]): T {
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = rng.next() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e.value;
  }
  return entries[entries.length - 1].value;
}

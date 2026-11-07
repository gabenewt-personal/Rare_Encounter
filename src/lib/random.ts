/** Small deterministic PRNG helpers (same seed ⇒ same sequence on every device). */

/** 32-bit string hash (cyrb53-style mix, truncated). */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export type Rng = () => number;

/** mulberry32 — returns floats in [0, 1). */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Weighted sampling without replacement. */
export function weightedSample<T>(items: readonly T[], weight: (t: T) => number, count: number, rng: Rng): T[] {
  const pool = items.filter((t) => weight(t) > 0);
  const picked: T[] = [];
  while (picked.length < count && pool.length) {
    const total = pool.reduce((s, t) => s + weight(t), 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= weight(pool[idx]);
      if (r < 0) break;
    }
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// The generator's random stream: xoshiro128** (Blackman and Vigna) over 32-bit integers, seeded from sha256 of a
// domain string, the instance seed, a label and an index, so every draw is a pure function of the seed and reads the
// same on every JavaScript engine (Math.imul and 32-bit shifts only). Each instance draws from a stream of its own
// (streamFor: the seed, "instance" and its index), so one instance's draws never move another's.

import { createHash } from 'node:crypto';

/** The domain every stream's sha256 starts with. */
export const RNG_DOMAIN = "makefun/solver-home/rng/v1";

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

export class Rng {
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  /** Seeded from the first 16 bytes of key (a sha256), big-endian; an all-zero state is refused. */
  constructor(key: Uint8Array) {
    const v = new DataView(key.buffer, key.byteOffset, 16);
    this.#a = v.getUint32(0) | 0;
    this.#b = v.getUint32(4) | 0;
    this.#c = v.getUint32(8) | 0;
    this.#d = v.getUint32(12) | 0;
    if ((this.#a | this.#b | this.#c | this.#d) === 0) throw new RangeError('an all-zero xoshiro128** state never moves');
  }

  /** The next 32-bit draw, 0 to 2^32 - 1. */
  u32(): number {
    const a = this.#a;
    const b = this.#b;
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    let c = this.#c ^ a;
    let d = this.#d ^ b;
    const nb = b ^ c;
    const na = a ^ d;
    c ^= t;
    d = rotl(d, 11);
    this.#a = na;
    this.#b = nb;
    this.#c = c;
    this.#d = d;
    return result;
  }

  /** A whole number from lo to hi, both included (an unbiased draw by rejection). */
  int(lo: number, hi: number): number {
    if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi < lo || hi - lo >= 2 ** 32) throw new RangeError('int(' + lo + ', ' + hi + '): two whole numbers, lo <= hi, under 2^32 apart');
    const span = hi - lo + 1;
    if (span === 2 ** 32) return lo + this.u32();
    const limit = Math.floor(2 ** 32 / span) * span;
    let x = this.u32();
    while (x >= limit) x = this.u32();
    return lo + (x % span);
  }

  /** A number from 0 to under 1, on a grid of 2^-32. */
  float(): number {
    return this.u32() / 2 ** 32;
  }

  /** One element of xs, uniformly. */
  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new RangeError('pick: an empty array');
    return xs[this.int(0, xs.length - 1)]!;
  }

  /** True with probability p (0 to 1). */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** xs shuffled in place (Fisher and Yates, from the last element down), and returned. */
  shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const t = xs[i]!;
      xs[i] = xs[j]!;
      xs[j] = t;
    }
    return xs;
  }
}

/** The stream of label and index under seed (64 lowercase hex). */
export function streamFor(seed: string, label: string, index: number): Rng {
  return new Rng(createHash('sha256').update(RNG_DOMAIN + '\n' + seed + '\n' + label + '\n' + index).digest());
}

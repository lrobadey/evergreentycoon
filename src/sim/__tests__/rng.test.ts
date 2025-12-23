import { describe, expect, it } from "vitest";

import { mulberry32, rngPoisson, seedForWeek, type Rng } from "../rng";

describe("rng", () => {
  it("seedForWeek is stable and mixes salt", () => {
    expect(seedForWeek(0, 123)).toBe(287762816);
    expect(seedForWeek(1, 123)).toBe(593787926);
    expect(seedForWeek(40, 123)).toBe(471352377);

    expect(seedForWeek(0, 123)).not.toBe(seedForWeek(0, 124));
    expect(seedForWeek(0, 123)).not.toBe(seedForWeek(1, 123));
  });

  it("mulberry32 is reproducible", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA).toEqual([
      0.7872516233474016,
      0.1785435655619949,
      0.49531551403924823,
      0.23136196262203157,
      0.375791602069512,
    ]);
  });

  it("rngPoisson is reproducible for a given rng state", () => {
    const rng10: Rng = { state: 287762816 };
    expect(Array.from({ length: 5 }, () => rngPoisson(rng10, 10))).toEqual([7, 14, 8, 14, 10]);

    const rng40: Rng = { state: 287762816 };
    expect(Array.from({ length: 5 }, () => rngPoisson(rng40, 40))).toEqual([46, 38, 48, 59, 51]);
  });
});


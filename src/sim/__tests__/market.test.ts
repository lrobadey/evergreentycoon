import { describe, expect, it } from "vitest";

import { SPECIES } from "../constants";
import { createInitialState } from "../tick";
import { systemMarket } from "../systems/market";
import { systemPricing } from "../systems/pricing";

function setupState(): ReturnType<typeof createInitialState> {
  const state = createInitialState({ seed: 123 });
  state.date = new Date(2025, 11, 15); // Dec 15 (tree season)

  // Cocoa stand
  state.tiles[1].base = { kind: "cocoa" };

  // Mature trees to sell
  state.tiles[0].base = {
    kind: "tree",
    speciesId: "douglasFir",
    ageWeeks: SPECIES.douglasFir.maturityWeeks,
    treesRemaining: 7,
    plantedWeek: 0,
    history: [1],
  };
  state.tiles[2].base = {
    kind: "tree",
    speciesId: "fraserFir",
    ageWeeks: SPECIES.fraserFir.maturityWeeks,
    treesRemaining: 5,
    plantedWeek: 0,
    history: [1],
  };

  return state;
}

describe("systemMarket", () => {
  it("is deterministic given the same runSeed and weekIndex", () => {
    const weekIndex = 40;

    const s1 = setupState();
    const p1 = systemPricing(s1);
    const r1 = systemMarket(s1, p1, { weekIndex });

    const s2 = setupState();
    const p2 = systemPricing(s2);
    const r2 = systemMarket(s2, p2, { weekIndex });

    expect(r1).toEqual(r2);
    expect(s1.money).toBe(s2.money);
    expect(s1.reputation01).toBeCloseTo(s2.reputation01, 12);

    const snapshotBases = (s: typeof s1) =>
      s.tiles.map((t) => {
        if (t.base.kind === "tree") {
          return {
            kind: t.base.kind,
            speciesId: t.base.speciesId,
            ageWeeks: t.base.ageWeeks,
            treesRemaining: t.base.treesRemaining,
          };
        }
        return { kind: t.base.kind };
      });
    expect(snapshotBases(s1)).toEqual(snapshotBases(s2));
  });

  it("changes weekSeed across different weeks (even if other outcomes coincide)", () => {
    const s = setupState();
    const prices = systemPricing(s);

    const a = systemMarket(s, prices, { weekIndex: 40 });

    const sNext = setupState();
    const pricesNext = systemPricing(sNext);
    const b = systemMarket(sNext, pricesNext, { weekIndex: 41 });

    expect(a.debug?.weekSeed).not.toBe(b.debug?.weekSeed);
  });

  it("does not sell trees outside the Nov 1 → Dec 25 window", () => {
    const state = setupState();
    state.date = new Date(2025, 11, 26); // Dec 26

    const before = state.tiles.map((t) => (t.base.kind === "tree" ? t.base.treesRemaining : null));
    const prices = systemPricing(state);
    const report = systemMarket(state, prices, { weekIndex: 41 });

    expect(report.treeIntents).toBe(0);
    expect(report.treesSold).toBe(0);
    const after = state.tiles.map((t) => (t.base.kind === "tree" ? t.base.treesRemaining : null));
    expect(after).toEqual(before);
  });
});

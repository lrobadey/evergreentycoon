import { describe, expect, it } from "vitest";

import { PRICING_TUNING, SPECIES } from "../constants";
import { createInitialState } from "../tick";
import { systemPricing } from "../systems/pricing";

describe("systemPricing", () => {
  it("pegs to max price when supply is zero", () => {
    const state = createInitialState({ seed: 123 });
    state.date = new Date(2025, 11, 15); // Dec 15 (tree season)

    const prices = systemPricing(state);
    expect(prices.supplyTrees.douglasFir).toBe(0);
    expect(prices.supplyTrees.fraserFir).toBe(0);

    expect(prices.trees.douglasFir).toBe(Math.round(SPECIES.douglasFir.basePrice * PRICING_TUNING.maxMult));
    expect(prices.trees.fraserFir).toBe(Math.round(SPECIES.fraserFir.basePrice * PRICING_TUNING.maxMult));
  });

  it("pegs to min price under heavy glut", () => {
    const state = createInitialState({ seed: 123 });
    state.date = new Date(2025, 11, 15); // Dec 15 (tree season)

    // Create an extreme glut: many mature trees in a single patch.
    const douglas = SPECIES.douglasFir;
    state.tiles[0].base = {
      kind: "tree",
      speciesId: "douglasFir",
      ageWeeks: douglas.maturityWeeks,
      treesRemaining: 1_000_000,
      plantedWeek: 0,
      history: [1],
    };

    const prices = systemPricing(state);
    expect(prices.supplyTrees.douglasFir).toBe(1_000_000);
    expect(prices.trees.douglasFir).toBe(Math.round(douglas.basePrice * PRICING_TUNING.minMult));
  });
});


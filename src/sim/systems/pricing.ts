import { computeCheer } from "../actions";
import { MARKET_SIZE_TUNING, PRICING_TUNING, SPECIES } from "../constants";
import type { GameState, SpeciesId, WeeklyPrices } from "../types";
import { attractionMultiplier, holidayDemand01, isTreeSeasonActive, reputationMultiplier } from "./market_math";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clearPrice(opts: { basePrice: number; demandAtBase: number; supply: number }): { price: number; demandAtPrice: number } {
  const p0 = Math.max(0.01, opts.basePrice);
  const d0 = Math.max(0, opts.demandAtBase);
  const s = Math.max(0, opts.supply);

  const minP = p0 * PRICING_TUNING.minMult;
  const maxP = p0 * PRICING_TUNING.maxMult;
  const e = Math.max(0.001, PRICING_TUNING.elasticity);

  const demandAtPrice = (p: number): number => {
    const ratio = Math.max(0.0001, p / p0);
    return d0 * Math.pow(ratio, -e);
  };

  // No supply: price pegs high (players perceive scarcity), but no units can clear.
  if (s <= 0) {
    return { price: maxP, demandAtPrice: demandAtPrice(maxP) };
  }

  // If demand is basically zero, peg to min price.
  if (d0 <= 0) {
    return { price: minP, demandAtPrice: 0 };
  }

  const f = (p: number): number => demandAtPrice(p) - s;

  const fMin = f(minP);
  if (fMin < 0) {
    // Even at the cheapest allowed price, demand < supply (glut) => peg low.
    return { price: minP, demandAtPrice: demandAtPrice(minP) };
  }

  const fMax = f(maxP);
  if (fMax > 0) {
    // Even at the most expensive allowed price, demand > supply (scarcity) => peg high.
    return { price: maxP, demandAtPrice: demandAtPrice(maxP) };
  }

  // Root exists in [minP, maxP]. Binary search.
  let lo = minP;
  let hi = maxP;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm > 0) {
      // demand > supply => price too low
      lo = mid;
    } else {
      // demand < supply => price too high
      hi = mid;
    }
  }

  const price = (lo + hi) / 2;
  return { price, demandAtPrice: demandAtPrice(price) };
}

export function systemPricing(state: GameState): WeeklyPrices {
  const supplyTrees: Record<SpeciesId, number> = { douglasFir: 0, fraserFir: 0 };

  for (const t of state.tiles) {
    if (t.base.kind !== "tree") continue;
    const def = SPECIES[t.base.speciesId];
    if (t.base.treesRemaining <= 0) continue;
    if (t.base.ageWeeks < def.maturityWeeks) continue;
    supplyTrees[t.base.speciesId] += t.base.treesRemaining;
  }

  // Deterministic demand drivers (no RNG, no weekly shock).
  const cheer = computeCheer(state.tiles);
  const maturePatchCount = state.tiles.reduce((n, t) => {
    if (t.base.kind !== "tree") return n;
    const def = SPECIES[t.base.speciesId];
    return t.base.ageWeeks >= def.maturityWeeks && t.base.treesRemaining > 0 ? n + 1 : n;
  }, 0);

  const hd01 = holidayDemand01(state.date);
  const attractionMult = attractionMultiplier(cheer, maturePatchCount);
  const repMult = reputationMultiplier(state.reputation01);

  const expectedVisitors =
    (MARKET_SIZE_TUNING.baselineVisitors + MARKET_SIZE_TUNING.holidayVisitorScale * hd01) * attractionMult * repMult;

  const treeSeason = isTreeSeasonActive(state.date);
  const expectedTreeIntents = treeSeason ? expectedVisitors * clamp(PRICING_TUNING.treeIntentRate, 0, 1) : 0;

  const share = PRICING_TUNING.speciesDemandShare;
  const shareSum = Math.max(1e-6, share.douglasFir + share.fraserFir);
  const demandAtBaseTrees: Record<SpeciesId, number> = {
    douglasFir: expectedTreeIntents * (share.douglasFir / shareSum),
    fraserFir: expectedTreeIntents * (share.fraserFir / shareSum),
  };

  const trees: Record<SpeciesId, number> = { douglasFir: 0, fraserFir: 0 };
  const demandAtClearingTrees: Record<SpeciesId, number> = { douglasFir: 0, fraserFir: 0 };
  const scarcity01Trees: Record<SpeciesId, number> = { douglasFir: 0, fraserFir: 0 };

  (Object.keys(SPECIES) as SpeciesId[]).forEach((speciesId) => {
    const basePrice = SPECIES[speciesId].basePrice;
    const args = {
      basePrice,
      demandAtBase: demandAtBaseTrees[speciesId],
      supply: supplyTrees[speciesId],
    };
    const { price, demandAtPrice } = clearPrice(args);

    // -----------------------------------------------------------------------
    // Sanity checks (lightweight; should never fire)
    // -----------------------------------------------------------------------
    const again = clearPrice(args);
    if (Math.abs(again.price - price) > 1e-9 || Math.abs(again.demandAtPrice - demandAtPrice) > 1e-9) {
      // eslint-disable-next-line no-console
      console.warn("[pricing] non-deterministic clearPrice()", { speciesId, args, first: { price, demandAtPrice }, again });
    }
    const moreSupply = clearPrice({ ...args, supply: args.supply + 1 });
    if (moreSupply.price > price + 1e-9) {
      // eslint-disable-next-line no-console
      console.warn("[pricing] monotonicity violated: more supply increased price", {
        speciesId,
        supply: args.supply,
        supplyPlus1: args.supply + 1,
        price,
        pricePlus1: moreSupply.price,
      });
    }

    const p = Math.round(price);
    trees[speciesId] = Math.max(0, p);
    demandAtClearingTrees[speciesId] = demandAtPrice;

    // Scarcity proxy: normalize price lift above base into 0..1.
    const p0 = Math.max(0.01, basePrice);
    const maxLift = Math.max(1e-6, PRICING_TUNING.maxMult - 1);
    const lift = price / p0 - 1;
    scarcity01Trees[speciesId] = clamp(lift / maxLift, 0, 1);
  });

  return { trees, supplyTrees, demandAtClearingTrees, scarcity01Trees };
}



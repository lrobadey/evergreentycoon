import {
  COCOA_CAPACITY_PER_WEEK_PER_STAND,
  COCOA_PRICE,
  DECOR_MAX_LEVEL,
  HOLIDAY_TUNING,
  MARKET_PURCHASE_TUNING,
  MARKET_SIZE_TUNING,
  PATCH_CAPACITY,
  REPUTATION_TUNING,
  SPECIES,
} from "../constants";
import { computeCheer } from "../actions";
import { getSeason } from "../seasons";
import { rngNextFloat, rngNormal01, rngPoisson, seedForWeek, type Rng } from "../rng";
import type { GameState, SpeciesId, TreePatch, WeeklyMarketReport, WeeklyPrices } from "../types";
import { attractionMultiplier, holidayDemand01, isTreeSeasonActive, reputationMultiplier } from "./market_math";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

type SellablePatch = {
  tileIdx: number;
  patch: TreePatch;
  weight: number;
};

function isMatureAndSellable(patch: TreePatch): boolean {
  if (patch.treesRemaining <= 0) return false;
  return patch.ageWeeks >= SPECIES[patch.speciesId].maturityWeeks;
}

function weightForPatch(patch: TreePatch): number {
  // Bias toward "full" patches (players see it as a stronger attractor).
  const fullness01 = clamp(patch.treesRemaining / PATCH_CAPACITY, 0, 1);
  return Math.pow(fullness01, 2);
}

function pickWeightedIndex(rng: Rng, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return -1;
  let roll = rngNextFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function weeklyShockMultiplier(rng: Rng): number {
  const sigma = Math.max(0, HOLIDAY_TUNING.weeklyShockStdDev);
  if (sigma <= 0) return 1;
  // Lognormal with mean ~ 1: exp(N(-0.5*sigma^2, sigma))
  const z = rngNormal01(rng);
  const logShock = z * sigma - 0.5 * sigma * sigma;
  const shock = Math.exp(logShock);
  return clamp(shock, HOLIDAY_TUNING.weeklyShockMin, HOLIDAY_TUNING.weeklyShockMax);
}

export function systemMarket(state: GameState, prices: WeeklyPrices, opts: { weekIndex: number }): WeeklyMarketReport {
  const season = getSeason(state.date);
  // Deterministic within a run: all randomness for a given week is derived from (runSeed, weekIndex).
  // This preserves "never the same" by default (runSeed is random per new game), while enabling replay via seed.
  const weekSeed = seedForWeek(opts.weekIndex, state.rngSeed);
  const rng: Rng = { state: weekSeed >>> 0 };

  const cheer = computeCheer(state.tiles);
  state.cheer = cheer;

  const cocoaStands = state.tiles.filter((t) => t.base.kind === "cocoa").length;
  const cocoaCapacity = cocoaStands * COCOA_CAPACITY_PER_WEEK_PER_STAND;

  const sellable: SellablePatch[] = [];
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.base.kind !== "tree") continue;
    if (!isMatureAndSellable(t.base)) continue;
    sellable.push({ tileIdx: i, patch: t.base, weight: weightForPatch(t.base) });
  }
  const maturePatchCount = sellable.length;
  const availableSpeciesAtStart = new Set<SpeciesId>(sellable.map((s) => s.patch.speciesId));

  const hd01 = holidayDemand01(state.date);
  const attractionMult = attractionMultiplier(cheer, maturePatchCount);
  const repMult = reputationMultiplier(state.reputation01);
  const shockMult = weeklyShockMultiplier(rng);

  const expectedVisitors = (MARKET_SIZE_TUNING.baselineVisitors + MARKET_SIZE_TUNING.holidayVisitorScale * hd01) * attractionMult * repMult * shockMult;
  const visitors = rngPoisson(rng, expectedVisitors);

  const treesSoldBySpecies: Record<SpeciesId, number> = {
    douglasFir: 0,
    fraserFir: 0,
  };

  let treeIntents = 0;
  let treesSold = 0;
  let cocoaAttempts = 0;
  let cocoaSold = 0;
  let soldOut = false;

  const pAddOn = clamp(
    MARKET_PURCHASE_TUNING.cocoaAddOnBaseChance + cheer * MARKET_PURCHASE_TUNING.cocoaAddOnCheerChancePerPoint,
    0,
    0.95,
  );
  const pSoldOutCocoa = clamp(
    MARKET_PURCHASE_TUNING.cocoaOnlyWhenSoldOutChance + cheer * MARKET_PURCHASE_TUNING.cocoaOnlyWhenSoldOutCheerChancePerPoint,
    0,
    0.95,
  );
  const pNonTreeCocoa = clamp(
    MARKET_PURCHASE_TUNING.cocoaNonTreeVisitChance + cheer * MARKET_PURCHASE_TUNING.cocoaNonTreeVisitCheerChancePerPoint,
    0,
    0.95,
  );

  const treeRevenue = () =>
    Object.entries(treesSoldBySpecies).reduce((sum, [id, count]) => {
      const speciesId = id as SpeciesId;
      return sum + count * prices.trees[speciesId];
    }, 0);

  const treeSeason = isTreeSeasonActive(state.date);
  if (treeSeason) {
    treeIntents = visitors; // tree-first framing (Nov 1 → Dec 25)
    for (let v = 0; v < visitors; v++) {
      if (sellable.length === 0) {
        soldOut = true;
        if (rngNextFloat(rng) < pSoldOutCocoa) {
          cocoaAttempts += 1;
          if (cocoaSold < cocoaCapacity) {
            cocoaSold += 1;
          }
        }
        continue;
      }

      const weights = sellable.map((s) => s.weight);
      const picked = pickWeightedIndex(rng, weights);
      if (picked < 0) {
        soldOut = true;
        continue;
      }

      const target = sellable[picked];
      target.patch.treesRemaining -= 1;
      treesSold += 1;
      treesSoldBySpecies[target.patch.speciesId] += 1;

      if (target.patch.treesRemaining <= 0) {
        // Patch is cleared when sold out (decor remains).
        state.tiles[target.tileIdx].base = { kind: "empty" };
        sellable.splice(picked, 1);
      } else {
        target.weight = weightForPatch(target.patch);
      }

      if (rngNextFloat(rng) < pAddOn) {
        cocoaAttempts += 1;
        if (cocoaSold < cocoaCapacity) {
          cocoaSold += 1;
        }
      }
    }
  } else {
    // Non-tree weeks: visitors can still exist (baseline + attraction + reputation), cocoa is still a secondary purchase.
    treeIntents = 0;
    for (let v = 0; v < visitors; v++) {
      if (rngNextFloat(rng) < pNonTreeCocoa) {
        cocoaAttempts += 1;
        if (cocoaSold < cocoaCapacity) {
          cocoaSold += 1;
        }
      }
    }
  }

  const cocoaRevenue = cocoaSold * COCOA_PRICE;
  const treesRevenue = treeRevenue();
  const totalRevenue = cocoaRevenue + treesRevenue;

  state.money += totalRevenue;

  // Reputation update (slow months-scale memory)
  const maxCheer = state.gridW * state.gridH * DECOR_MAX_LEVEL;
  const decor01 = clamp(maxCheer > 0 ? cheer / maxCheer : 0, 0, 1);

  const totalSpecies = Object.keys(SPECIES).length;
  const variety01 = clamp(totalSpecies > 0 ? availableSpeciesAtStart.size / totalSpecies : 0, 0, 1);

  const stockFill01Raw = treeIntents > 0 ? treesSold / treeIntents : 1;
  const stock01 = clamp(Math.pow(clamp(stockFill01Raw, 0, 1), REPUTATION_TUNING.stockPow), 0, 1);

  const cocoa01 = cocoaAttempts > 0 ? clamp(cocoaSold / cocoaAttempts, 0, 1) : 1;

  const w = REPUTATION_TUNING.weights;
  const wSum = Math.max(1e-6, w.stock + w.variety + w.decor + w.cocoa);
  const experience01 =
    (w.stock * stock01 + w.variety * variety01 + w.decor * decor01 + w.cocoa * cocoa01) / wSum;

  const hl = Math.max(0.001, REPUTATION_TUNING.halfLifeWeeks);
  const alpha = 1 - Math.pow(0.5, 1 / hl);
  state.reputation01 = clamp(state.reputation01 + alpha * (experience01 - state.reputation01), 0, 1);

  return {
    date: new Date(state.date),
    season,
    weekIndex: opts.weekIndex,
    visitors,
    treeIntents,
    treesSold,
    treesSoldBySpecies,
    cocoaAttempts,
    cocoaSold,
    soldOut,
    prices,
    holidayDemand01: hd01,
    attractionMult,
    reputation01: state.reputation01,
    expectedVisitors,
    debug: {
      runSeed: state.rngSeed >>> 0,
      weekSeed: weekSeed >>> 0,
      shockMult,
    },
    experience: {
      decor01,
      stock01,
      variety01,
      cocoa01,
      total01: experience01,
    },
    revenue: {
      trees: treesRevenue,
      cocoa: cocoaRevenue,
      total: totalRevenue,
      treesBySpecies: {
        douglasFir: treesSoldBySpecies.douglasFir * prices.trees.douglasFir,
        fraserFir: treesSoldBySpecies.fraserFir * prices.trees.fraserFir,
      },
    },
  };
}


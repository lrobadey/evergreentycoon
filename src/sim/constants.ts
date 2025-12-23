import type { DecorLevel, SpeciesDef, SpeciesId } from "./types";

export const SIM_START_DATE = new Date("2025-03-01T00:00:00");

export const GRID_W = 4;
export const GRID_H = 4;

export const STARTING_MONEY = 3200;

// Land rent (charged monthly on the 1st; sim charges on the first tick that enters a new month)
export const RENT_MONTHLY = 150;

export const PATCH_CAPACITY = 25;
export const PATCH_HISTORY_MAX = 120;

export const REFUND_RATE = 0.25;

export const COCOA_STAND_COST = 200;
export const COCOA_PRICE = 6;
export const COCOA_CAPACITY_PER_WEEK_PER_STAND = 10;

export const DECOR_MAX_LEVEL: DecorLevel = 3;
export const DECOR_UPGRADE_COST: Record<Exclude<DecorLevel, 0>, number> = {
  1: 50,
  2: 125,
  3: 250,
};

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  douglasFir: {
    id: "douglasFir",
    label: "Douglas fir",
    shortLabel: "D",
    maturityWeeks: 312,
    basePrice: 70,
    plantCost: 250,
  },
  fraserFir: {
    id: "fraserFir",
    label: "Fraser fir",
    shortLabel: "F",
    maturityWeeks: 416,
    basePrice: 90,
    plantCost: 350,
  },
};

// ============================================================================
// Emergent Market Tuning (3 big signals: HolidayDemand, Reputation, Attraction)
// ============================================================================

export const MARKET_SIZE_TUNING = {
  // Always-on background visitors (vibes / locals). Small.
  baselineVisitors: 2,
  // Peak-season market size multiplier (scaled by HolidayDemand01).
  holidayVisitorScale: 95,
};

export const PRICING_TUNING = {
  // Price bounds relative to species basePrice.
  minMult: 0.6,
  maxMult: 2.2,

  // Demand elasticity in Qd(p) = D0 * (p/p0)^(-elasticity).
  // Higher => demand drops faster as price rises.
  elasticity: 1.25,

  // During tree season, fraction of visitors that intend to buy a tree (0..1).
  treeIntentRate: 1.0,

  // Split total tree-demand across species in V1.
  speciesDemandShare: {
    douglasFir: 0.55,
    fraserFir: 0.45,
  },
};

export const HOLIDAY_TUNING = {
  // Date anchor: peak is Dec 25; ramp begins Nov 1; plateau begins Dec 8.
  rampStartMonth0: 10, // 0=Jan ... 10=Nov
  rampStartDay: 1,
  plateauStartMonth0: 11, // Dec
  plateauStartDay: 8,
  peakMonth0: 11, // Dec
  peakDay: 25,

  plateauLevel: 1.0,

  // Make the Nov ramp feel like a “rush into plateau”.
  // >1 makes it steeper near the end.
  rampExponent: 2.4,

  // Sharp drop after Dec 25.
  postPeakHalfLifeDays: 3,

  // Optional world volatility (applied once per week, multiplicative, mean ~ 1)
  weeklyShockStdDev: 0.12,
  weeklyShockMin: 0.75,
  weeklyShockMax: 1.35,
};

export const ATTRACTION_TUNING = {
  // Mature patches: big 0→1 jump, diminishing returns afterward.
  matureMaxExtraMult: 1.6, // max extra beyond 1.0 (so up to 2.6×)
  matureK: 1.0,

  // Cheer: compounding multiplier with an “exponential-ish” feel.
  cheerScale: 18,
  cheerPow: 1.6,
  cheerMaxMult: 6,
};

export const REPUTATION_TUNING = {
  // Months-scale memory via EMA half-life.
  halfLifeWeeks: 12,
  repMaxExtraMult: 0.8, // reputation multiplies demand by (1 + repMaxExtraMult*(rep-0.5)*2)

  weights: {
    stock: 0.42,
    variety: 0.24,
    decor: 0.22,
    cocoa: 0.12,
  },

  // Penalize sell-outs / wasted trips more than linear.
  stockPow: 1.6,
};

export const MARKET_PURCHASE_TUNING = {
  // Cocoa behavior: always an add-on/secondary purchase, never the visit driver.
  cocoaAddOnBaseChance: 0.22,
  cocoaAddOnCheerChancePerPoint: 0.002,

  // If tree-intent visitors get sold out, a few still grab cocoa.
  cocoaOnlyWhenSoldOutChance: 0.10,
  cocoaOnlyWhenSoldOutCheerChancePerPoint: 0.001,

  // If visitors came for other reasons (non-tree weeks), cocoa can still be bought as an add-on.
  cocoaNonTreeVisitChance: 0.06,
  cocoaNonTreeVisitCheerChancePerPoint: 0.0005,
};



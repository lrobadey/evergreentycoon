export type Season = "winter" | "spring" | "summer" | "fall";

export type Speed = 1 | 2 | 5 | 10 | 20;

export type SpeciesId = "douglasFir" | "fraserFir";

export type SpeciesDef = {
  id: SpeciesId;
  label: string;
  shortLabel: string;
  maturityWeeks: number;
  basePrice: number;
  plantCost: number;
};

export type EmptyBase = { kind: "empty" };
export type CocoaBase = { kind: "cocoa" };

export type TreePatch = {
  kind: "tree";
  speciesId: SpeciesId;
  ageWeeks: number;
  treesRemaining: number;
  plantedWeek: number;
  history: number[]; // normalized maturity ratio (0..1) per week
};

export type TileBase = EmptyBase | CocoaBase | TreePatch;

export type DecorLevel = 0 | 1 | 2 | 3;

export type Tile = {
  base: TileBase;
  decorLevel: DecorLevel;
};

export type RevenueBreakdown = {
  trees: number;
  cocoa: number;
  total: number;
  treesBySpecies: Record<SpeciesId, number>;
};

export type WeeklyPrices = {
  trees: Record<SpeciesId, number>;
  // Optional diagnostics (useful for tuning / HUD visibility)
  supplyTrees: Record<SpeciesId, number>;
  demandAtClearingTrees: Record<SpeciesId, number>;
  scarcity01Trees: Record<SpeciesId, number>;
};

export type WeeklyMarketReport = {
  date: Date;
  season: Season;
  visitors: number;
  treeIntents: number;
  treesSold: number;
  treesSoldBySpecies: Record<SpeciesId, number>;
  cocoaAttempts: number;
  cocoaSold: number;
  soldOut: boolean;
  prices: WeeklyPrices;
  // Rent info for the week tick (0 if no rent was charged this tick).
  rentPaid?: number;
  // Stored as the 1st of the month that was charged (even if the tick date isn't the 1st).
  rentPaymentDate?: Date | null;
  // Emergent market diagnostics (tuning visibility)
  holidayDemand01: number; // 0..1
  attractionMult: number;
  reputation01: number; // 0..1 (post-update value)
  expectedVisitors: number; // lambda before sampling
  experience: {
    decor01: number;
    stock01: number;
    variety01: number;
    cocoa01: number;
    total01: number;
  };
  revenue: RevenueBreakdown;
};

export type GameState = {
  date: Date;
  money: number;
  speed: Speed;
  running: boolean;
  gridW: number;
  gridH: number;
  tiles: Tile[];
  selectedTileIdx: number | null;
  cheer: number;
  reputation01: number;
  holidayVibe01: number;
  farmAttraction01: number;
  trends: {
    reputation01: number[];
    holidayVibe01: number[];
    farmAttraction01: number[];
  };
  // When rent was last charged (stored as the 1st of that month).
  lastRentPaymentDate: Date | null;
  rngSeed: number;
  rngState: number;
  lastReport: WeeklyMarketReport | null;
};



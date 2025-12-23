import { COCOA_STAND_COST, DECOR_MAX_LEVEL, DECOR_UPGRADE_COST, PATCH_CAPACITY, REFUND_RATE, SPECIES } from "./constants";
import type { DecorLevel, GameState, SpeciesId, Tile, TileBase } from "./types";
import { getWeeksSinceStart } from "./time";

function clampDecorLevel(v: number): DecorLevel {
  if (v <= 0) return 0;
  if (v === 1) return 1;
  if (v === 2) return 2;
  return 3;
}

export function computeCheer(tiles: Tile[]): number {
  return tiles.reduce((sum, t) => sum + t.decorLevel, 0);
}

export function createEmptyBase(): TileBase {
  return { kind: "empty" };
}

export function createEmptyTile(): Tile {
  return { base: createEmptyBase(), decorLevel: 0 };
}

export function refreshCheer(state: GameState): void {
  state.cheer = computeCheer(state.tiles);
}

export function plantAt(state: GameState, tileIdx: number, speciesId: SpeciesId): void {
  const tile = state.tiles[tileIdx];
  if (!tile) return;
  if (tile.base.kind !== "empty") return;

  const def = SPECIES[speciesId];
  if (state.money < def.plantCost) return;
  state.money -= def.plantCost;

  const plantedWeek = getWeeksSinceStart(state.date);
  tile.base = {
    kind: "tree",
    speciesId,
    ageWeeks: 0,
    treesRemaining: PATCH_CAPACITY,
    plantedWeek,
    history: [0],
  };
}

export function buildCocoaAt(state: GameState, tileIdx: number): void {
  const tile = state.tiles[tileIdx];
  if (!tile) return;
  if (tile.base.kind !== "empty") return;

  if (state.money < COCOA_STAND_COST) return;
  state.money -= COCOA_STAND_COST;
  tile.base = { kind: "cocoa" };
}

export function bulldozeBaseAt(state: GameState, tileIdx: number): void {
  const tile = state.tiles[tileIdx];
  if (!tile) return;
  if (tile.base.kind === "empty") return;

  let refund = 0;
  if (tile.base.kind === "cocoa") {
    refund = Math.floor(COCOA_STAND_COST * REFUND_RATE);
  } else if (tile.base.kind === "tree") {
    refund = Math.floor(SPECIES[tile.base.speciesId].plantCost * REFUND_RATE);
  }

  state.money += refund;
  tile.base = { kind: "empty" };
}

export function getDecorUpgradeCost(current: DecorLevel): number | null {
  if (current >= DECOR_MAX_LEVEL) return null;
  const next = clampDecorLevel(current + 1) as Exclude<DecorLevel, 0>;
  return DECOR_UPGRADE_COST[next];
}

export function upgradeDecorAt(state: GameState, tileIdx: number): void {
  const tile = state.tiles[tileIdx];
  if (!tile) return;

  if (tile.decorLevel >= DECOR_MAX_LEVEL) return;
  const next = clampDecorLevel(tile.decorLevel + 1) as Exclude<DecorLevel, 0>;
  const cost = DECOR_UPGRADE_COST[next];
  if (state.money < cost) return;

  state.money -= cost;
  tile.decorLevel = next;
  refreshCheer(state);
}



import { PATCH_HISTORY_MAX, SPECIES } from "../constants";
import type { GameState } from "../types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function systemGrowth(state: GameState): void {
  for (const tile of state.tiles) {
    if (tile.base.kind !== "tree") continue;

    tile.base.ageWeeks += 1;

    const maturityWeeks = SPECIES[tile.base.speciesId].maturityWeeks;
    const norm = clamp(tile.base.ageWeeks / maturityWeeks, 0, 1);
    tile.base.history.push(norm);
    if (tile.base.history.length > PATCH_HISTORY_MAX) {
      tile.base.history.splice(0, tile.base.history.length - PATCH_HISTORY_MAX);
    }
  }
}



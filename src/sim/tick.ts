import { GRID_H, GRID_W, RENT_MONTHLY, SIM_START_DATE, STARTING_MONEY } from "./constants";
import { createEmptyTile, refreshCheer } from "./actions";
import { addDays, getWeeksSinceStart } from "./time";
import type { GameState, WeeklyMarketReport } from "./types";
import { systemGrowth } from "./systems/growth";
import { systemPricing } from "./systems/pricing";
import { systemMarket } from "./systems/market";

function defaultSeed32(): number {
  // Seedable RNG: defaults to an unpredictable seed, but can be overridden by caller.
  try {
    const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
    if (cryptoObj?.getRandomValues) {
      const buf = new Uint32Array(1);
      cryptoObj.getRandomValues(buf);
      return buf[0] >>> 0;
    }
  } catch {
    // ignore
  }
  return ((Date.now() >>> 0) ^ (((Math.random() * 0xffffffff) >>> 0) as number)) >>> 0;
}

export function createInitialState(opts?: { seed?: number }): GameState {
  const tiles = Array.from({ length: GRID_W * GRID_H }, () => createEmptyTile());
  const seed = (opts?.seed ?? defaultSeed32()) >>> 0;
  const reputation01 = 0.5;
  const holidayVibe01 = 0;
  const farmAttraction01 = 0;
  const state: GameState = {
    date: new Date(SIM_START_DATE),
    money: STARTING_MONEY,
    speed: 1,
    running: true,
    gridW: GRID_W,
    gridH: GRID_H,
    tiles,
    selectedTileIdx: null,
    cheer: 0,
    reputation01,
    holidayVibe01,
    farmAttraction01,
    trends: {
      reputation01: [reputation01],
      holidayVibe01: [holidayVibe01],
      farmAttraction01: [farmAttraction01],
    },
    lastRentPaymentDate: null,
    rngSeed: seed,
    lastReport: null,
  };
  refreshCheer(state);
  return state;
}

export function tickWeek(state: GameState): WeeklyMarketReport {
  const prevDate = state.date;
  state.date = addDays(state.date, 7);
  const weekIndex = getWeeksSinceStart(state.date);

  // --------------------------------------------------------------------------
  // Rent: charge when we enter a new month (recorded as the 1st of that month).
  // This is "on the 1st" in a weekly sim where we might never land exactly on day 1.
  // --------------------------------------------------------------------------
  let rentPaid = 0;
  let rentPaymentDate: Date | null = null;
  const enteredNewMonth =
    prevDate.getFullYear() !== state.date.getFullYear() || prevDate.getMonth() !== state.date.getMonth();
  if (enteredNewMonth) {
    const monthStart = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
    const last = state.lastRentPaymentDate;
    const alreadyPaidThisMonth =
      last !== null && last.getFullYear() === monthStart.getFullYear() && last.getMonth() === monthStart.getMonth();
    if (!alreadyPaidThisMonth) {
      state.money -= RENT_MONTHLY; // allow negative balances
      state.lastRentPaymentDate = monthStart;
      rentPaid = RENT_MONTHLY;
      rentPaymentDate = monthStart;
    }
  }

  systemGrowth(state);
  const prices = systemPricing(state);
  const report = systemMarket(state, prices, { weekIndex });
  // Attach rent info so the UI can show receipts without introducing a new event bus.
  report.rentPaid = rentPaid;
  report.rentPaymentDate = rentPaymentDate;
  state.lastReport = report;

  // --------------------------------------------------------------------------
  // Trends (26-week HUD sparklines)
  // --------------------------------------------------------------------------

  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

  const pushCapped = (arr: number[], v: number, cap: number): void => {
    arr.push(v);
    while (arr.length > cap) arr.shift();
  };

  // Holiday vibe: holiday calendar signal + décor warmth (both already deterministic)
  state.holidayVibe01 = clamp01(0.65 * report.holidayDemand01 + 0.35 * report.experience.decor01);

  // Farm attraction: map attraction multiplier (>=~1) into a smooth 0..1 meter.
  //  - atMult=1 => 0
  //  - atMult~2 => ~0.63
  //  - atMult~3 => ~0.86
  const k = 1.0;
  state.farmAttraction01 = clamp01(1 - Math.exp(-k * Math.max(0, report.attractionMult - 1)));

  // Reputation already updated by market system and returned in report.reputation01.
  pushCapped(state.trends.reputation01, clamp01(state.reputation01), 26);
  pushCapped(state.trends.holidayVibe01, state.holidayVibe01, 26);
  pushCapped(state.trends.farmAttraction01, state.farmAttraction01, 26);

  return report;
}


import { describe, expect, it } from "vitest";

import { HOLIDAY_TUNING } from "../constants";
import { attractionMultiplier, holidayDemand01, isTreeSeasonActive, reputationMultiplier } from "../systems/market_math";

describe("market_math", () => {
  it("holidayDemand01 matches the holiday tuning shape", () => {
    const plateauLevel = HOLIDAY_TUNING.plateauLevel;

    const oct31 = new Date(2025, 9, 31);
    const nov1 = new Date(2025, 10, 1);
    const nov2 = new Date(2025, 10, 2);
    const dec8 = new Date(2025, 11, 8);
    const dec25 = new Date(2025, 11, 25);
    const dec26 = new Date(2025, 11, 26);

    expect(holidayDemand01(oct31)).toBe(0);
    expect(holidayDemand01(nov1)).toBe(0); // rampStart is inclusive; demand starts rising after Nov 1
    expect(holidayDemand01(nov2)).toBeGreaterThan(0);
    expect(holidayDemand01(nov2)).toBeLessThanOrEqual(plateauLevel);

    expect(holidayDemand01(dec8)).toBeCloseTo(plateauLevel, 8);
    expect(holidayDemand01(dec25)).toBeCloseTo(plateauLevel, 8);
    expect(holidayDemand01(dec26)).toBeLessThan(plateauLevel);
  });

  it("isTreeSeasonActive is exactly Nov 1 through Dec 25 (inclusive)", () => {
    expect(isTreeSeasonActive(new Date(2025, 9, 31))).toBe(false); // Oct 31
    expect(isTreeSeasonActive(new Date(2025, 10, 1))).toBe(true); // Nov 1
    expect(isTreeSeasonActive(new Date(2025, 11, 25))).toBe(true); // Dec 25
    expect(isTreeSeasonActive(new Date(2025, 11, 26))).toBe(false); // Dec 26
    expect(isTreeSeasonActive(new Date(2026, 0, 1))).toBe(false); // Jan 1
  });

  it("attractionMultiplier increases with cheer and mature patches", () => {
    const a0 = attractionMultiplier(0, 0);
    const aCheer = attractionMultiplier(10, 0);
    const aMature = attractionMultiplier(0, 2);
    const aBoth = attractionMultiplier(10, 2);
    expect(aCheer).toBeGreaterThanOrEqual(a0);
    expect(aMature).toBeGreaterThanOrEqual(a0);
    expect(aBoth).toBeGreaterThanOrEqual(aCheer);
    expect(aBoth).toBeGreaterThanOrEqual(aMature);
  });

  it("reputationMultiplier is bounded and symmetric around 0.5", () => {
    expect(reputationMultiplier(-1)).toBeGreaterThanOrEqual(0.2);
    expect(reputationMultiplier(2)).toBeLessThanOrEqual(3);

    const low = reputationMultiplier(0);
    const mid = reputationMultiplier(0.5);
    const high = reputationMultiplier(1);
    expect(mid).toBeCloseTo(1, 10);
    expect(high).toBeGreaterThan(mid);
    expect(low).toBeLessThan(mid);
  });
});

import { describe, expect, it } from "vitest";

import { RENT_MONTHLY, SIM_START_DATE } from "../constants";
import { createInitialState, tickWeek } from "../tick";

describe("tickWeek", () => {
  it("advances by one week and reports weekIndex correctly", () => {
    const state = createInitialState({ seed: 123 });
    expect(state.date.getTime()).toBe(SIM_START_DATE.getTime());

    const r1 = tickWeek(state);
    expect(r1.weekIndex).toBe(1);

    const r2 = tickWeek(state);
    expect(r2.weekIndex).toBe(2);
  });

  it("charges rent once per month rollover", () => {
    const state = createInitialState({ seed: 123 });

    const reports = Array.from({ length: 6 }, () => tickWeek(state));
    const rentPaid = reports.map((r) => r.rentPaid ?? 0);

    // Starting on Mar 1: the first month rollover happens on the tick that lands on Apr 5.
    expect(rentPaid.slice(0, 5)).toEqual([0, 0, 0, 0, RENT_MONTHLY]);
    expect(reports[4].rentPaymentDate?.getFullYear()).toBe(2025);
    expect(reports[4].rentPaymentDate?.getMonth()).toBe(3); // Apr
    expect(reports[4].rentPaymentDate?.getDate()).toBe(1);

    // Following week is still April; no extra rent.
    expect(rentPaid[5]).toBe(0);

    // Tick forward to the next month rollover (May 3).
    let mayReport = reports[5];
    while (state.date.getMonth() !== 4) {
      mayReport = tickWeek(state);
    }
    expect(mayReport.rentPaid ?? 0).toBe(RENT_MONTHLY);
    expect(mayReport.rentPaymentDate?.getFullYear()).toBe(2025);
    expect(mayReport.rentPaymentDate?.getMonth()).toBe(4); // May
    expect(mayReport.rentPaymentDate?.getDate()).toBe(1);
  });

  it("caps trend arrays at 26 values", () => {
    const state = createInitialState({ seed: 123 });
    for (let i = 0; i < 35; i++) tickWeek(state);
    expect(state.trends.reputation01.length).toBe(26);
    expect(state.trends.holidayVibe01.length).toBe(26);
    expect(state.trends.farmAttraction01.length).toBe(26);
  });
});


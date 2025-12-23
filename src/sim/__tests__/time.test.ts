import { describe, expect, it } from "vitest";

import { addDays, getDaysUntilRent, getNextRentDate, getWeeksSinceStart } from "../time";

describe("time", () => {
  it("addDays advances by local calendar days", () => {
    const start = new Date(2025, 0, 31); // Jan 31, 2025 (local)
    const next = addDays(start, 7);
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(1); // Feb
    expect(next.getDate()).toBe(7);
  });

  it("getNextRentDate returns the 1st of next month", () => {
    const d1 = new Date(2025, 2, 1); // Mar 1
    const n1 = getNextRentDate(d1);
    expect(n1.getFullYear()).toBe(2025);
    expect(n1.getMonth()).toBe(3); // Apr
    expect(n1.getDate()).toBe(1);

    const d2 = new Date(2025, 11, 31); // Dec 31
    const n2 = getNextRentDate(d2);
    expect(n2.getFullYear()).toBe(2026);
    expect(n2.getMonth()).toBe(0); // Jan
    expect(n2.getDate()).toBe(1);
  });

  it("getWeeksSinceStart is DST-safe for local-midnight dates", () => {
    // In many DST time zones (e.g. America/Los_Angeles), 2025-03-09 is a 23h day.
    // Week indices should still advance by 1 per +7 calendar days.
    const w0 = getWeeksSinceStart(new Date(2025, 2, 1)); // Mar 1, 2025
    const w1 = getWeeksSinceStart(new Date(2025, 2, 8)); // Mar 8
    const w2 = getWeeksSinceStart(new Date(2025, 2, 15)); // Mar 15 (crosses DST in many zones)
    expect([w0, w1, w2]).toEqual([0, 1, 2]);
  });

  it("getDaysUntilRent counts calendar days (DST-safe)", () => {
    // Mar 30 -> Apr 1 is 2 days regardless of DST shifts.
    expect(getDaysUntilRent(new Date(2025, 2, 30))).toBe(2);
    expect(getDaysUntilRent(new Date(2025, 2, 31))).toBe(1);
    expect(getDaysUntilRent(new Date(2025, 3, 1))).toBe(30); // Apr 1 -> May 1
  });
});


import { SIM_START_DATE } from "./constants";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcMidnightFromLocalDate(date: Date): number {
  // Use the local calendar date, but compute the timestamp at UTC midnight for that date.
  // This avoids DST-driven week/day drift when comparing local-midnight dates.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeeksSinceStart(date: Date): number {
  const diffMs = utcMidnightFromLocalDate(date) - utcMidnightFromLocalDate(SIM_START_DATE);
  return Math.floor(diffMs / MS_PER_WEEK);
}

export function getNextRentDate(date: Date): Date {
  // Rent is "due on the 1st". The next due date from any day in a month is the 1st of the next month.
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function getDaysUntilRent(date: Date): number {
  const next = getNextRentDate(date);
  const diffMs = utcMidnightFromLocalDate(next) - utcMidnightFromLocalDate(date);
  return Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
}


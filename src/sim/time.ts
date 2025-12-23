import { SIM_START_DATE } from "./constants";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeeksSinceStart(date: Date): number {
  return Math.floor((date.getTime() - SIM_START_DATE.getTime()) / MS_PER_WEEK);
}

export function getNextRentDate(date: Date): Date {
  // Rent is "due on the 1st". The next due date from any day in a month is the 1st of the next month.
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function getDaysUntilRent(date: Date): number {
  const next = getNextRentDate(date);
  const diffMs = next.getTime() - date.getTime();
  return Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
}



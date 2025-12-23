import type { Season } from "./types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function utcMidnightFromLocalDate(date: Date): number {
  // Use the local calendar date, but compute the timestamp at UTC midnight for that date.
  // This avoids DST-driven week drift when comparing local-midnight dates.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getSeason(date: Date): Season {
  const m = date.getMonth(); // 0=Jan ... 11=Dec
  if (m === 11 || m === 0 || m === 1) return "winter"; // Dec–Feb
  if (m === 2 || m === 3 || m === 4) return "spring"; // Mar–May
  if (m === 5 || m === 6 || m === 7) return "summer"; // Jun–Aug
  return "fall"; // Sep–Nov
}

export function formatSeason(season: Season): string {
  if (season === "fall") return "Autumn";
  return season.charAt(0).toUpperCase() + season.slice(1);
}

export function getSeasonStart(date: Date): Date {
  const year = date.getFullYear();
  const season = getSeason(date);
  if (season === "winter") {
    // Winter starts Dec 1. For Jan/Feb, that’s Dec 1 of the previous year.
    const m = date.getMonth();
    const winterYear = m === 11 ? year : year - 1;
    return new Date(winterYear, 11, 1);
  }
  if (season === "spring") return new Date(year, 2, 1);
  if (season === "summer") return new Date(year, 5, 1);
  return new Date(year, 8, 1);
}

export function getSeasonWeekIndex(date: Date): number {
  const start = getSeasonStart(date);
  return Math.floor((utcMidnightFromLocalDate(date) - utcMidnightFromLocalDate(start)) / MS_PER_WEEK);
}

export function isChristmasPeriod(date: Date): boolean {
  const m = date.getMonth(); // 0=Jan ... 11=Dec
  const d = date.getDate();
  
  // November 1 - November 30
  if (m === 10) return true;
  
  // December 1 - December 31
  if (m === 11) return true;
  
  // January 1 only
  if (m === 0 && d === 1) return true;
  
  return false;
}


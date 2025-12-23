import { ATTRACTION_TUNING, HOLIDAY_TUNING, REPUTATION_TUNING } from "../constants";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function msPerDay(): number {
  return 24 * 60 * 60 * 1000;
}

function holidayAnchorYear(date: Date): number {
  // For Jan/Feb, we still refer to the previous Dec 25 holiday.
  const y = date.getFullYear();
  const m = date.getMonth(); // 0=Jan ... 11=Dec
  return m <= 1 ? y - 1 : y;
}

function holidayDatesFor(date: Date): { rampStart: Date; plateauStart: Date; peak: Date } {
  const y = holidayAnchorYear(date);
  return {
    rampStart: new Date(y, HOLIDAY_TUNING.rampStartMonth0, HOLIDAY_TUNING.rampStartDay),
    plateauStart: new Date(y, HOLIDAY_TUNING.plateauStartMonth0, HOLIDAY_TUNING.plateauStartDay),
    peak: new Date(y, HOLIDAY_TUNING.peakMonth0, HOLIDAY_TUNING.peakDay),
  };
}

export function holidayDemand01(date: Date): number {
  const { rampStart, plateauStart, peak } = holidayDatesFor(date);

  if (date < rampStart) return 0;

  if (date < plateauStart) {
    const t = (date.getTime() - rampStart.getTime()) / (plateauStart.getTime() - rampStart.getTime());
    const base = smoothstep01(t);
    return clamp(Math.pow(base, HOLIDAY_TUNING.rampExponent) * HOLIDAY_TUNING.plateauLevel, 0, 1);
  }

  if (date <= peak) {
    return clamp(HOLIDAY_TUNING.plateauLevel, 0, 1);
  }

  const daysPast = (date.getTime() - peak.getTime()) / msPerDay();
  const halfLife = Math.max(0.001, HOLIDAY_TUNING.postPeakHalfLifeDays);
  const decay = Math.pow(0.5, daysPast / halfLife);
  return clamp(HOLIDAY_TUNING.plateauLevel * decay, 0, 1);
}

export function isTreeSeasonActive(date: Date): boolean {
  const { rampStart, peak } = holidayDatesFor(date);
  return date >= rampStart && date <= peak;
}

export function attractionMultiplier(cheer: number, maturePatchCount: number): number {
  const matureMult =
    1 + ATTRACTION_TUNING.matureMaxExtraMult * (1 - Math.exp(-ATTRACTION_TUNING.matureK * Math.max(0, maturePatchCount)));
  const cheerBase = 1 + Math.max(0, cheer) / Math.max(1e-6, ATTRACTION_TUNING.cheerScale);
  const cheerMult = clamp(Math.pow(cheerBase, ATTRACTION_TUNING.cheerPow), 1, ATTRACTION_TUNING.cheerMaxMult);
  return matureMult * cheerMult;
}

export function reputationMultiplier(rep01: number): number {
  const rep = clamp(rep01, 0, 1);
  const centered = (rep - 0.5) * 2; // -1..+1
  const mult = 1 + REPUTATION_TUNING.repMaxExtraMult * centered;
  return clamp(mult, 0.2, 3);
}



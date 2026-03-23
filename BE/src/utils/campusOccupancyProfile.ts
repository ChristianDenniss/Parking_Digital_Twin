import fs from "fs";
import path from "path";
import { DateTime } from "luxon";

/**
 * Heuristic “people on campus” curve (JSON). Consumed here and via `utils/occupancySignal.ts`
 * (`campusOccupancyInstantForMoncton`) for simulator + scenario assign.
 */

/** UNBSJ civil time (Atlantic, DST-aware). */
export const UNBSJ_TIMEZONE = "America/Moncton";

export type WinterSlot = {
  slotStart: string;
  slotEnd: string;
  carsOnCampusMidpoint: number;
};

type PplFile = {
  winter2026: { slots: WinterSlot[] };
};

let cachedProfile: PplFile | null = null;

function profilePath(): string {
  return path.join(__dirname, "../../data/pplOnCampusByTime.json");
}

export function loadPplOnCampusProfile(): PplFile {
  if (cachedProfile) return cachedProfile;
  const raw = fs.readFileSync(profilePath(), "utf-8");
  cachedProfile = JSON.parse(raw) as PplFile;
  return cachedProfile;
}

export function getWinter2026Slots(): WinterSlot[] {
  return loadPplOnCampusProfile().winter2026.slots;
}

/** Minutes since midnight [0, 1440); 24:00 end sentinel maps to 1440 only for parsing slotEnd. */
export function clockToMinutes(clock: string): number {
  const [hs, ms] = clock.split(":");
  const h = parseInt(hs ?? "0", 10);
  const m = parseInt(ms ?? "0", 10);
  if (h === 24 && m === 0) return 24 * 60;
  return h * 60 + m;
}

/** Index 0..95 for 15-minute grid covering [00:00, 24:00). */
export function minutesToSlotIndex(minutesSinceMidnight: number): number {
  const m = Math.max(0, Math.min(minutesSinceMidnight, 24 * 60 - 1));
  return Math.floor(m / 15);
}

export function isWeekendLuxon(dt: DateTime): boolean {
  return dt.weekday === 6 || dt.weekday === 7;
}

/** Scale campus cars down on Sat/Sun (sparse campus). */
export function weekendCarsMultiplier(dt: DateTime): number {
  return isWeekendLuxon(dt) ? 0.22 : 1;
}

export function getMonctonNow(): DateTime {
  return DateTime.now().setZone(UNBSJ_TIMEZONE);
}

/** Parse `YYYY-MM-DD` + `HH:mm` as civil time in Moncton. */
export function parseScenarioMoncton(dateYmd: string, timeHm: string): DateTime | null {
  const dm = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeHm.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const y = parseInt(dm[1]!, 10);
  const mo = parseInt(dm[2]!, 10);
  const d = parseInt(dm[3]!, 10);
  const h = parseInt(tm[1]!, 10);
  const min = parseInt(tm[2]!, 10);
  if (![y, mo, d, h, min].every((n) => Number.isFinite(n))) return null;
  if (min < 0 || min > 59 || h < 0 || h > 23) return null;
  const dt = DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: min }, { zone: UNBSJ_TIMEZONE });
  return dt.isValid ? dt : null;
}

export function getSlotTriple(indices: {
  prev: number;
  curr: number;
  next: number;
}): { prev: WinterSlot; curr: WinterSlot; next: WinterSlot } {
  const slots = getWinter2026Slots();
  const n = slots.length;
  const prev = slots[((indices.prev % n) + n) % n]!;
  const curr = slots[((indices.curr % n) + n) % n]!;
  const next = slots[((indices.next % n) + n) % n]!;
  return { prev, curr, next };
}

export function profileInstantForMoncton(dt: DateTime): {
  slotIndex: number;
  carsPrev: number;
  carsCurr: number;
  carsNext: number;
  weekendMultiplier: number;
} {
  const z = dt.setZone(UNBSJ_TIMEZONE);
  const minutes = z.hour * 60 + z.minute;
  const slots = getWinter2026Slots();
  const n = slots.length;
  const idx = Math.min(minutesToSlotIndex(minutes), n - 1);
  const prevI = (idx - 1 + n) % n;
  const nextI = (idx + 1) % n;
  const { prev, curr, next } = getSlotTriple({ prev: prevI, curr: idx, next: nextI });
  const mult = weekendCarsMultiplier(z);
  return {
    slotIndex: idx,
    carsPrev: prev.carsOnCampusMidpoint * mult,
    carsCurr: curr.carsOnCampusMidpoint * mult,
    carsNext: next.carsOnCampusMidpoint * mult,
    weekendMultiplier: mult,
  };
}

export function targetOccupancyRatio(carsMid: number, totalSpots: number): number {
  if (totalSpots <= 0) return 0;
  return Math.min(1, Math.max(0, carsMid / totalSpots));
}

/**
 * Scale flip intensity from adjacent-slot car deltas; trend in [-1,1] for arrival vs leave bias.
 */
export function churnFromTriple(carsPrev: number, carsCurr: number, carsNext: number): {
  flipsScale: number;
  trend: number;
} {
  const d1 = Math.abs(carsCurr - carsPrev);
  const d2 = Math.abs(carsNext - carsCurr);
  // Use max so a flat "next" slot (common with 15m buckets) still allows churn from prev→curr.
  const activity = Math.max(d1, d2, (d1 + d2) / 2);
  // Typical peak activity on this dataset is on the order of hundreds per 15m.
  const raw = 0.28 + activity / 95;
  const flipsScale = Math.min(4.5, Math.max(0.22, raw));
  const span = Math.max(50, carsCurr * 0.15 + 20);
  const trend = Math.max(-1, Math.min(1, (carsNext - carsPrev) / span));
  return { flipsScale, trend };
}

/**
 * Extra parking churn near typical class-adjacent minutes (:00/:30 blocks, :20/:50-style ends, buffers).
 * Scales simulator flips when the profile curve is smooth between 15m buckets.
 */
export function classTransitionChurnMultiplier(dt: DateTime): number {
  const m = dt.setZone(UNBSJ_TIMEZONE).minute;
  const hubs = [0, 10, 20, 30, 40, 50];
  let dist = 99;
  for (const h of hubs) {
    dist = Math.min(dist, Math.abs(m - h));
  }
  if (dist <= 2) return 2.4;
  if (dist <= 5) return 1.65;
  if (dist <= 8) return 1.22;
  return 1;
}

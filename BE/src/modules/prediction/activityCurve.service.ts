/**
 * Phase 3 – Enrollment-driven campus activity curve.
 *
 * Queries the `classes` table to build a normalised 0–1 activity index per
 * hour of the day, then optionally weights it by each lot's proximity to
 * buildings (using lot_building_distances).
 */

import { AppDataSource } from "../../db/data-source";
import { Course } from "../classes/course.entity";
import { LotBuildingDistance } from "../buildings/lotBuildingDistance.entity";
import { hasPlausibleMeetingTimes } from "../classes/courseMeetingTime.util";
import { DEFAULT_ARRIVAL_PLAN_TERM_CODE, normalizeArrivalTermCode } from "../../utils/arrivalPlanTerms";
import { getDemandMultiplier } from "./campusParameter.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHour(timeStr: string): number {
  const [h] = timeStr.split(":").map(Number);
  return h ?? 0;
}

/** Returns every hour index [0,23] that this course occupies (inclusive start, exclusive end hour). */
function getOccupiedHours(startTime: string, endTime: string): number[] {
  const startH = parseHour(startTime);
  const endH   = parseHour(endTime);
  const hours: number[] = [];
  if (endH <= startH) {
    hours.push(startH);
  } else {
    for (let h = startH; h < endH; h++) {
      hours.push(h);
    }
  }
  return hours;
}

// ─── Global activity curve ────────────────────────────────────────────────────

/**
 * Builds a 24-element array (0–1) representing campus activity by hour,
 * derived from enrolled headcounts for all courses in the given terms.
 */
export async function computeGlobalActivityCurve(termCodes?: string[], targetDate?: Date): Promise<number[]> {
  const repo = AppDataSource.getRepository(Course);
  const qb = repo.createQueryBuilder("c").where("c.enrolled > 0");

  const codes = (termCodes && termCodes.length > 0)
    ? termCodes.map(normalizeArrivalTermCode)
    : [normalizeArrivalTermCode(DEFAULT_ARRIVAL_PLAN_TERM_CODE)];

  qb.andWhere("UPPER(TRIM(c.term)) IN (:...codes)", { codes });

  const courses = await qb.getMany();

  // Get demand multiplier (accounts for carpool rate, non-driver rate, absence rate)
  // Use the day-of-week from targetDate if provided; otherwise use a neutral weekday (Tuesday).
  const dayOfWeek = targetDate ? targetDate.getDay() : 2;
  const demandMultiplier = await getDemandMultiplier(dayOfWeek);

  const raw = new Array<number>(24).fill(0);
  for (const c of courses) {
    if (!hasPlausibleMeetingTimes(c.startTime, c.endTime)) continue;
    // Apply demand multiplier: only the fraction of enrolled students who drive
    const enrolled = (c.enrolled ?? 0) * demandMultiplier;
    for (const h of getOccupiedHours(c.startTime, c.endTime)) {
      raw[h] = (raw[h] ?? 0) + enrolled;
    }
  }

  const peak = Math.max(...raw, 1);
  return raw.map((v) => v / peak);
}

/** Single-hour shortcut. */
export async function getGlobalActivityIndex(hour: number, termCodes?: string[], targetDate?: Date): Promise<number> {
  const curve = await computeGlobalActivityCurve(termCodes, targetDate);
  return curve[hour] ?? 0;
}

// ─── Lot-specific activity curve ─────────────────────────────────────────────

const PROXIMITY_MIN  = 0.70;
const PROXIMITY_MAX  = 1.00;
const MAX_DISTANCE_M = 1000; // beyond this the lot gets minimum weight

/**
 * Returns a proximity weight [0.70, 1.00] for a lot based on its average
 * distance to buildings.  Closer lots get a higher weight.
 */
async function proximityWeight(lotId: string): Promise<number> {
  const repo = AppDataSource.getRepository(LotBuildingDistance);
  const rows = await repo.find({ where: { parkingLotId: lotId } });
  if (rows.length === 0) return (PROXIMITY_MIN + PROXIMITY_MAX) / 2; // neutral

  const avgDist = rows.reduce((s, r) => s + r.distanceMeters, 0) / rows.length;
  const clamped = Math.min(avgDist, MAX_DISTANCE_M);
  // Closer (lower dist) → higher weight
  return PROXIMITY_MAX - (clamped / MAX_DISTANCE_M) * (PROXIMITY_MAX - PROXIMITY_MIN);
}

/**
 * Returns a 24-element activity curve for a specific lot, scaled by its
 * proximity to buildings.
 */
export async function computeLotActivityCurve(lotId: string, termCodes?: string[], targetDate?: Date): Promise<number[]> {
  const [global, weight] = await Promise.all([
    computeGlobalActivityCurve(termCodes, targetDate),
    proximityWeight(lotId),
  ]);
  return global.map((v) => Math.min(1, v * weight));
}

/** Single-hour lot-specific activity index. */
export async function getLotActivityIndex(lotId: string, hour: number, termCodes?: string[], targetDate?: Date): Promise<number> {
  const curve = await computeLotActivityCurve(lotId, termCodes, targetDate);
  return curve[hour] ?? 0;
}

/**
 * Batch: compute lot-specific curves for all lots and normalise so the
 * maximum value across all lots equals 1.
 */
export async function computeAllLotsActivityCurves(termCodes?: string[]): Promise<Record<string, number[]>> {
  const repo = AppDataSource.getRepository(LotBuildingDistance);
  const allRows = await repo.find();
  const lotIds = [...new Set(allRows.map((r) => r.parkingLotId))];

  if (lotIds.length === 0) return {};

  const entries = await Promise.all(
    lotIds.map(async (id) => [id, await computeLotActivityCurve(id, termCodes)] as const),
  );

  // Cross-lot normalisation
  let globalPeak = 0;
  for (const [, curve] of entries) globalPeak = Math.max(globalPeak, ...curve);
  if (globalPeak === 0) globalPeak = 1;

  return Object.fromEntries(
    entries.map(([id, curve]) => [id, curve.map((v) => v / globalPeak)]),
  );
}

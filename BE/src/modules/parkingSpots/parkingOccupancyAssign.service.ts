import type { Course } from "../classes/course.entity";
import * as courseService from "../classes/course.service";
import { hasPlausibleMeetingTimes } from "../classes/courseMeetingTime.util";
import * as buildingService from "../buildings/building.service";
import * as lotBuildingDistanceService from "../buildings/lotBuildingDistance.service";
import { campusOccupancyInstantForMoncton } from "../../utils/occupancySignal";
import {
  churnFromTriple,
  classTransitionChurnMultiplier,
  clockToMinutes,
  getWinter2026Slots,
  loadPplOnCampusProfile,
  minutesToSlotIndex,
  parseScenarioMoncton,
  profileInstantForMoncton,
  targetOccupancyRatio,
  UNBSJ_TIMEZONE,
} from "../../utils/campusOccupancyProfile";
import { randomInt } from "crypto";
import { DateTime } from "luxon";
import * as parkingSpotService from "./parkingSpot.service";
import { invalidateCache } from "../../middleware/cache";
import { getArrivalPlanTermCodes, normalizeArrivalTermCode } from "../../utils/arrivalPlanTerms";
import type { OccupancySignalSourceId } from "../../utils/occupancySignal";
import { ParkingLot } from "../parkingLots/parkingLot.entity";
import { In } from "typeorm";
import { AppDataSource } from "../../db/data-source";

const D0_M = 35;
const DIST_POW = 1.45;

/** Half-width as fraction of target count: k ~ uniform in [center·(1−s), center·(1+s)]. Override with `OCC_SNAPSHOT_K_SPREAD`. */
const DEFAULT_K_SPREAD = 0.09;

/** Extra randomness when choosing which stalls are occupied within a lot (still front-biased). 0 = strict front-fill. `OCC_SNAPSHOT_SCORE_NOISE`. */
const DEFAULT_SCORE_NOISE = 5;

function parseEnvFloat(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Integer in [lo, hi] inclusive. */
function randomIntInclusive(lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return randomInt(lo, hi + 1);
}

/**
 * Pick how many stalls are occupied campus-wide: centered on r·n but jittered so
 * the same date/time does not always produce the same total.
 */
export function sampleKTotalForSnapshot(r: number, totalSpots: number): number {
  if (totalSpots <= 0) return 0;
  const spread = parseEnvFloat("OCC_SNAPSHOT_K_SPREAD", DEFAULT_K_SPREAD, 0, 0.45);
  const center = r * totalSpots;
  if (spread <= 0) {
    return Math.min(totalSpots, Math.max(0, Math.round(center)));
  }
  const lo = Math.max(0, Math.floor(center * (1 - spread)));
  const hi = Math.min(totalSpots, Math.ceil(center * (1 + spread)));
  return randomIntInclusive(lo, hi);
}

function courseMatchesArrivalTermFilter(course: Course, allowed: ReadonlySet<string>): boolean {
  const t = course.term?.trim();
  if (!t) return false;
  return allowed.has(normalizeArrivalTermCode(t));
}

function clockToMin(clock: string): number | null {
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h === 24 && min === 0) return 24 * 60;
  if (min < 0 || min > 59 || h < 0 || h > 23) return null;
  return h * 60 + min;
}

/** Class [start,end) overlaps [w0, w1) in same-day minutes. */
function intervalOverlapsMinutes(w0: number, w1: number, startM: number, endM: number): boolean {
  return startM < w1 && endM > w0;
}

export function isGeneralLotName(name: string): boolean {
  return name.replace(/\s/g, "").startsWith("General");
}

/**
 * Sum enrolled (or 1) per building id for courses overlapping the 15m window on scenario calendar day.
 */
export async function buildingDemandForScenarioWindow(slotStartMinutes: number): Promise<Map<string, number>> {
  const allowed = new Set(getArrivalPlanTermCodes().map(normalizeArrivalTermCode));
  const courses = await courseService.findAll();
  const w0 = slotStartMinutes;
  const w1 = slotStartMinutes + 15;
  const demand = new Map<string, number>();

  const buildingStrings = new Set<string>();
  for (const c of courses) {
    const b = c.building?.trim();
    if (b) buildingStrings.add(b);
  }
  const buildingIdByCourseString = new Map<string, string>();
  for (const s of buildingStrings) {
    const match = await buildingService.findBuildingForCourseBuilding(s);
    if (match) buildingIdByCourseString.set(s, match.id);
  }

  for (const c of courses) {
    if (!courseMatchesArrivalTermFilter(c, allowed)) continue;
    if (!hasPlausibleMeetingTimes(c.startTime, c.endTime)) continue;
    const bStr = c.building?.trim();
    if (!bStr) continue;
    const sm = clockToMin(c.startTime);
    const em = clockToMin(c.endTime);
    if (sm == null || em == null || em <= sm) continue;
    if (!intervalOverlapsMinutes(w0, w1, sm, em)) continue;

    const bid = buildingIdByCourseString.get(bStr);
    if (!bid) continue;
    const add = c.enrolled != null && c.enrolled > 0 ? c.enrolled : 1;
    demand.set(bid, (demand.get(bid) ?? 0) + add);
  }

  return demand;
}

export type SpotAssignInput = {
  id: string;
  parkingLotId: string;
  lotName: string;
  slotIndex: number | null;
};

function largestRemainderAllocation(weights: number[], kTotal: number): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || kTotal <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (kTotal * w) / sumW);
  const floors = raw.map((r) => Math.floor(r));
  let assigned = floors.reduce((a, b) => a + b, 0);
  const rem = raw.map((r, i) => ({ i, r: r - floors[i]! }));
  rem.sort((a, b) => b.r - a.r);
  let need = kTotal - assigned;
  const out = [...floors];
  for (let j = 0; j < rem.length && need > 0; j++) {
    out[rem[j]!.i] = (out[rem[j]!.i] ?? 0) + 1;
    need--;
  }
  return out;
}

function lotScoreGeneral(
  lotId: string,
  demand: Map<string, number>,
  distances: { buildingId: string; distanceMeters: number }[]
): number {
  let s = 0;
  for (const row of distances) {
    const d = row.distanceMeters;
    const dem = demand.get(row.buildingId) ?? 0;
    if (dem <= 0) continue;
    s += dem / Math.pow(Math.max(D0_M, d), DIST_POW);
  }
  return s > 0 ? s : 1;
}

/**
 * Assign occupied stalls: lot shares follow `lotWeights` and `kTotal`; within each lot,
 * stalls are chosen with a front-biased random score so the same date/time can look
 * slightly different on each apply. Tie-break order uses `scenarioKey` (include a random
 * suffix per run for maximum variety).
 */
export function assignStatusesForLots(
  spots: SpotAssignInput[],
  scenarioKey: string,
  kTotal: number,
  lotWeights: Map<string, number>,
  assignOpts?: { deterministic?: boolean }
): Map<string, "occupied" | "empty"> {
  const noiseScale =
    assignOpts?.deterministic === true
      ? 0
      : parseEnvFloat("OCC_SNAPSHOT_SCORE_NOISE", DEFAULT_SCORE_NOISE, 0, 80);

  const byLot = new Map<string, SpotAssignInput[]>();
  for (const s of spots) {
    const arr = byLot.get(s.parkingLotId) ?? [];
    arr.push(s);
    byLot.set(s.parkingLotId, arr);
  }
  const lotIds = [...byLot.keys()].sort();
  const weights = lotIds.map((id) => Math.max(1e-6, lotWeights.get(id) ?? 1));
  const kPerLot = largestRemainderAllocation(weights, kTotal);
  const kMap = new Map<string, number>();
  lotIds.forEach((id, i) => kMap.set(id, kPerLot[i] ?? 0));

  const result = new Map<string, "occupied" | "empty">();
  for (const lotId of lotIds) {
    const list = byLot.get(lotId)!;
    const k = Math.min(kMap.get(lotId) ?? 0, list.length);
    const sorted = [...list].sort((a, b) => {
      const sa = a.slotIndex ?? 1e9;
      const sb = b.slotIndex ?? 1e9;
      if (sa !== sb) return sa - sb;
      const ha = simpleHash(`${scenarioKey}|${a.id}`);
      const hb = simpleHash(`${scenarioKey}|${b.id}`);
      if (ha !== hb) return ha - hb;
      return a.id.localeCompare(b.id);
    });
    if (k <= 0) {
      for (const s of list) result.set(s.id, "empty");
      continue;
    }
    if (k >= list.length) {
      for (const s of list) result.set(s.id, "occupied");
      continue;
    }

    if (noiseScale <= 0) {
      for (let i = 0; i < sorted.length; i++) {
        result.set(sorted[i]!.id, i < k ? "occupied" : "empty");
      }
      continue;
    }

    const n = sorted.length;
    const scored = sorted.map((spot, i) => ({
      spot,
      score: n - i + noiseScale * (Math.random() - 0.5),
    }));
    scored.sort((a, b) => b.score - a.score);
    const occIds = new Set(scored.slice(0, k).map((x) => x.spot.id));
    for (const s of list) {
      result.set(s.id, occIds.has(s.id) ? "occupied" : "empty");
    }
  }
  return result;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export type ScenarioAssignmentMode = "deterministic" | "stochastic";

export async function computeLotWeightsAndK(
  spots: SpotAssignInput[],
  scenarioMoncton: DateTime,
  kMode: "sample" | "deterministic" = "sample"
): Promise<{ kTotal: number; lotWeights: Map<string, number> }> {
  const slots = getWinter2026Slots();
  const z = scenarioMoncton.setZone(UNBSJ_TIMEZONE);
  const minutes = z.hour * 60 + z.minute;
  const idx = Math.min(minutesToSlotIndex(minutes), slots.length - 1);
  const slotStartMin = clockToMinutes(slots[idx]!.slotStart);

  const prof = campusOccupancyInstantForMoncton(z);
  const totalSpots = spots.length;
  const r = targetOccupancyRatio(prof.carsCurr, totalSpots);
  const kTotal =
    kMode === "deterministic"
      ? Math.min(totalSpots, Math.max(0, Math.round(r * totalSpots)))
      : sampleKTotalForSnapshot(r, totalSpots);

  const demand = await buildingDemandForScenarioWindow(slotStartMin);
  const allDist = await lotBuildingDistanceService.findAll({});
  const distByLot = new Map<string, { buildingId: string; distanceMeters: number }[]>();
  for (const row of allDist) {
    const lid = row.parkingLotId;
    const arr = distByLot.get(lid) ?? [];
    arr.push({ buildingId: row.buildingId, distanceMeters: row.distanceMeters });
    distByLot.set(lid, arr);
  }

  const lotMeta = new Map<string, { name: string; cap: number }>();
  for (const s of spots) {
    const cur = lotMeta.get(s.parkingLotId);
    if (!cur) lotMeta.set(s.parkingLotId, { name: s.lotName, cap: 1 });
    else lotMeta.set(s.parkingLotId, { name: s.lotName, cap: cur.cap + 1 });
  }

  const lotWeights = new Map<string, number>();
  for (const [lotId, meta] of lotMeta) {
    const cap = meta.cap;
    if (isGeneralLotName(meta.name)) {
      const dists = distByLot.get(lotId) ?? [];
      const score = lotScoreGeneral(lotId, demand, dists);
      lotWeights.set(lotId, cap * Math.max(0.35, score));
    } else {
      lotWeights.set(lotId, cap);
    }
  }

  return { kTotal, lotWeights };
}

/**
 * Deterministic snapshot at Moncton date/time (same math as `applyScenarioOccupancy` with `mode: "deterministic"`).
 * Used for day-parking recommendations so suggested stalls match empty slots under the forecast.
 */
export async function previewScenarioAssignmentAt(dateYmd: string, timeHm: string): Promise<{
  spotIdToStatus: Map<string, "occupied" | "empty">;
  predictedSpotStatusByLotId: Record<string, Record<string, "occupied" | "empty">>;
  kTotal: number;
  totalSpots: number;
  spotRows: { id: string; parkingLotId: string }[];
}> {
  const dt = parseScenarioMoncton(dateYmd, timeHm);
  if (!dt) throw new Error("Invalid scenario date or time");

  const rows = await parkingSpotService.findAllWithLots();
  const spots: SpotAssignInput[] = rows.map((s) => ({
    id: s.id,
    parkingLotId: s.parkingLotId,
    lotName: s.parkingLot?.name ?? "",
    slotIndex: s.slotIndex,
  }));

  const { kTotal, lotWeights } = await computeLotWeightsAndK(spots, dt, "deterministic");
  const scenarioKey = `${dateYmd}|${timeHm}`;
  const statuses = assignStatusesForLots(spots, scenarioKey, kTotal, lotWeights, { deterministic: true });

  const predictedSpotStatusByLotId: Record<string, Record<string, "occupied" | "empty">> = {};
  for (const row of rows) {
    const st = statuses.get(row.id) ?? "empty";
    if (!predictedSpotStatusByLotId[row.parkingLotId]) {
      predictedSpotStatusByLotId[row.parkingLotId] = {};
    }
    predictedSpotStatusByLotId[row.parkingLotId]![row.id] = st;
  }

  return {
    spotIdToStatus: statuses,
    predictedSpotStatusByLotId,
    kTotal,
    totalSpots: rows.length,
    spotRows: rows.map((r) => ({ id: r.id, parkingLotId: r.parkingLotId })),
  };
}

export type LotForecastRow = {
  parkingLotId: string;
  name: string;
  spotCount: number;
  predictedOccupied: number;
  predictedFree: number;
  predictedOccupancyPercent: number;
};

export type ParkingForecastInsights = {
  /** Catalog term on the profile file (e.g. 2026/WI). */
  profileTermLabel: string;
  coursesInProfileFile: number | null;
  /** 15-minute bucket local times from `pplOnCampusByTime.json`. */
  profileSlotStart: string;
  profileSlotEnd: string;
  /** Saturday/Sunday uses a sparse-campus multiplier on the vehicle curve. */
  weekendApplied: boolean;
  weekendMultiplier: number;
  /** Modeled vehicles on campus (midpoint band, after weekend scale). */
  modeledCarsOnCampus: number;
  modeledCarsOnCampusMin?: number;
  modeledCarsOnCampusMax?: number;
  /** 0–100: this bucket’s modeled cars vs all buckets (same weekend scaling). Higher = busier time-of-day. */
  profileBusyPercentile: number;
  /** Enrollment proxy baked into the profile JSON for this 15m bucket (typical class-week pattern). */
  profileClassEnrolledProxy: number | null;
  /** Sections counted in the profile for this bucket. */
  profileSectionsMeeting: number | null;
  /** Sum of enrolled (min 1) for sections overlapping this bucket from the **live** course database (by building). */
  liveDbClassOverlapEnrollmentSum: number;
  /** Buildings with at least one overlapping section in the live DB. */
  liveDbBuildingsWithClasses: number;
  occupancyTrendNextSlot: "up" | "down" | "steady";
  occupancyTrendSummary: string;
  /** Simulator churn boost near class-change minutes. */
  classTransitionMultiplier: number;
  classTransitionSummary: string | null;
  /** If every stall saw the same fill ratio as the campus curve midpoint (lot weighting changes the real map). */
  curveEvenSpreadOccupancyPercent: number;
};

export type ParkingForecastResponse = {
  date: string;
  time: string;
  timezone: string;
  signalSource: OccupancySignalSourceId;
  modelNote: string;
  campusPredictedOccupancyPercent: number;
  kTotal: number;
  totalSpots: number;
  lots: LotForecastRow[];
  insights: ParkingForecastInsights;
};

async function buildForecastInsights(dt: DateTime, totalSpots: number): Promise<ParkingForecastInsights> {
  const z = dt.setZone(UNBSJ_TIMEZONE);
  const inst = profileInstantForMoncton(z);
  const slots = getWinter2026Slots();
  const rawSlot = slots[inst.slotIndex]!;
  const mult = inst.weekendMultiplier;

  const scaledMids = slots.map((s) => s.carsOnCampusMidpoint * mult);
  const currScaled = inst.carsCurr;
  const sorted = [...scaledMids].sort((a, b) => a - b);
  const below = sorted.filter((x) => x < currScaled).length;
  const profileBusyPercentile = scaledMids.length ? Math.round((below / scaledMids.length) * 100) : 0;

  const { trend } = churnFromTriple(inst.carsPrev, inst.carsCurr, inst.carsNext);
  let occupancyTrendNextSlot: "up" | "down" | "steady";
  let occupancyTrendSummary: string;
  if (trend > 0.12) {
    occupancyTrendNextSlot = "up";
    occupancyTrendSummary =
      "The campus vehicle curve rises into the next 15-minute block versus the previous one—typical of approaching peak demand.";
  } else if (trend < -0.12) {
    occupancyTrendNextSlot = "down";
    occupancyTrendSummary =
      "The curve eases into the next 15-minute block—demand is cooling compared to the prior bucket.";
  } else {
    occupancyTrendNextSlot = "steady";
    occupancyTrendSummary = "Neighboring 15-minute buckets are similar on the modeled vehicle curve.";
  }

  const slotStartMin = clockToMinutes(rawSlot.slotStart);
  const demand = await buildingDemandForScenarioWindow(slotStartMin);
  let liveDbClassOverlapEnrollmentSum = 0;
  let liveDbBuildingsWithClasses = 0;
  for (const v of demand.values()) {
    if (v > 0) {
      liveDbBuildingsWithClasses++;
      liveDbClassOverlapEnrollmentSum += v;
    }
  }

  const transition = classTransitionChurnMultiplier(z);
  const classTransitionSummary =
    transition > 1.2
      ? "Near a typical class-change minute; the live simulator applies extra stall churn here."
      : null;

  const ppl = loadPplOnCampusProfile();
  const w = ppl.winter2026;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    profileTermLabel: w.term ?? "Winter profile",
    coursesInProfileFile: typeof w.coursesIncluded === "number" ? w.coursesIncluded : null,
    profileSlotStart: rawSlot.slotStart,
    profileSlotEnd: rawSlot.slotEnd,
    weekendApplied: mult !== 1,
    weekendMultiplier: mult,
    modeledCarsOnCampus: round1(inst.carsCurr),
    modeledCarsOnCampusMin:
      rawSlot.carsOnCampusMin != null ? round1(rawSlot.carsOnCampusMin * mult) : undefined,
    modeledCarsOnCampusMax:
      rawSlot.carsOnCampusMax != null ? round1(rawSlot.carsOnCampusMax * mult) : undefined,
    profileBusyPercentile,
    profileClassEnrolledProxy:
      typeof rawSlot.totalEnrolledInClass === "number" ? rawSlot.totalEnrolledInClass : null,
    profileSectionsMeeting: typeof rawSlot.sectionsMeeting === "number" ? rawSlot.sectionsMeeting : null,
    liveDbClassOverlapEnrollmentSum,
    liveDbBuildingsWithClasses,
    occupancyTrendNextSlot,
    occupancyTrendSummary,
    classTransitionMultiplier: Math.round(transition * 100) / 100,
    classTransitionSummary,
    curveEvenSpreadOccupancyPercent:
      totalSpots > 0 ? Math.round(targetOccupancyRatio(inst.carsCurr, totalSpots) * 100) : 0,
  };
}

function normalizeForecastTimeHm(timeQ: string): string {
  const m = timeQ.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return timeQ.trim();
  const h = parseInt(m[1]!, 10);
  const min = m[2]!;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/**
 * Deterministic model snapshot for a Moncton-local instant (no DB writes).
 * Matches `apply-scenario` with `deterministic: true` for the same date/time.
 */
export async function getParkingForecastSummary(dateYmd: string, timeHmRaw: string): Promise<ParkingForecastResponse> {
  const timeHm = normalizeForecastTimeHm(timeHmRaw);
  const preview = await previewScenarioAssignmentAt(dateYmd, timeHm);
  const dt = parseScenarioMoncton(dateYmd, timeHm);
  if (!dt) throw new Error("Invalid scenario date or time");
  const prof = campusOccupancyInstantForMoncton(dt.setZone(UNBSJ_TIMEZONE));

  const byLot = new Map<string, { total: number; occ: number }>();
  for (const row of preview.spotRows) {
    const st = preview.spotIdToStatus.get(row.id) ?? "empty";
    const cur = byLot.get(row.parkingLotId) ?? { total: 0, occ: 0 };
    cur.total++;
    if (st === "occupied") cur.occ++;
    byLot.set(row.parkingLotId, cur);
  }

  const lotIds = [...byLot.keys()];
  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const lotRows = lotIds.length > 0 ? await lotRepo.find({ where: { id: In(lotIds) } }) : [];
  const lotById = new Map(lotRows.map((l) => [l.id, l]));

  const lots: LotForecastRow[] = lotIds.map((parkingLotId) => {
    const agg = byLot.get(parkingLotId)!;
    const lot = lotById.get(parkingLotId);
    const name = lot?.name ?? parkingLotId;
    const pct = agg.total > 0 ? Math.round((agg.occ / agg.total) * 100) : 0;
    return {
      parkingLotId,
      name,
      spotCount: agg.total,
      predictedOccupied: agg.occ,
      predictedFree: agg.total - agg.occ,
      predictedOccupancyPercent: pct,
    };
  });
  lots.sort((a, b) => b.predictedOccupancyPercent - a.predictedOccupancyPercent);

  const campusPct =
    preview.totalSpots > 0 ? Math.round((preview.kTotal / preview.totalSpots) * 100) : 0;

  const insights = await buildForecastInsights(dt, preview.totalSpots);

  return {
    date: dateYmd,
    time: timeHm,
    timezone: UNBSJ_TIMEZONE,
    signalSource: prof.source,
    modelNote:
      "UNB Saint John campus model: time-of-day curve plus class demand and walking distances (read-only; same basis as a deterministic map scenario).",
    campusPredictedOccupancyPercent: campusPct,
    kTotal: preview.kTotal,
    totalSpots: preview.totalSpots,
    lots,
    insights,
  };
}

const FORECAST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FORECAST_TIME_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * When both `date` and `time` query parts are valid, use them; otherwise Moncton “now”.
 */
export async function getParkingForecastForRequest(dateQ: string, timeQ: string): Promise<ParkingForecastResponse> {
  const d = dateQ.trim();
  const t = timeQ.trim();
  if (FORECAST_DATE_RE.test(d) && FORECAST_TIME_RE.test(t)) {
    const tm = t.match(FORECAST_TIME_RE)!;
    const timeHm = `${String(parseInt(tm[1]!, 10)).padStart(2, "0")}:${tm[2]!}`;
    return getParkingForecastSummary(d, timeHm);
  }
  const now = DateTime.now().setZone(UNBSJ_TIMEZONE);
  return getParkingForecastSummary(now.toFormat("yyyy-MM-dd"), now.toFormat("HH:mm"));
}

export async function applyScenarioOccupancy(
  dateYmd: string,
  timeHm: string,
  options?: { mode?: ScenarioAssignmentMode }
): Promise<{
  /** Spot rows whose status changed (actual DB writes). */
  updated: number;
  kTotal: number;
  totalSpots: number;
}> {
  const mode = options?.mode ?? "stochastic";
  const dt = parseScenarioMoncton(dateYmd, timeHm);
  if (!dt) throw new Error("Invalid scenario date or time");

  const rows = await parkingSpotService.findAllWithLots();
  const spots: SpotAssignInput[] = rows.map((s) => ({
    id: s.id,
    parkingLotId: s.parkingLotId,
    lotName: s.parkingLot?.name ?? "",
    slotIndex: s.slotIndex,
  }));

  const kMode = mode === "deterministic" ? "deterministic" : "sample";
  const { kTotal, lotWeights } = await computeLotWeightsAndK(spots, dt, kMode);
  const scenarioKey =
    mode === "deterministic"
      ? `${dateYmd}|${timeHm}`
      : `${dateYmd}|${timeHm}|${Date.now().toString(36)}-${randomIntInclusive(0, 1_000_000_000)}`;
  const statuses = assignStatusesForLots(spots, scenarioKey, kTotal, lotWeights, {
    deterministic: mode === "deterministic",
  });

  const updates: { id: string; status: "occupied" | "empty" }[] = [];
  for (const row of rows) {
    const next = statuses.get(row.id) ?? "empty";
    if (row.currentStatus !== next) {
      updates.push({ id: row.id, status: next });
    }
  }

  if (updates.length > 0) {
    await parkingSpotService.bulkSetStatusesWithoutLogs(updates);
    await invalidateCache("parking-lot-spots");
    await invalidateCache("parking-spots");
  }

  return { updated: updates.length, kTotal, totalSpots: rows.length };
}

/** Recompute occupancy snapshot for Moncton-local “now” (same pipeline as apply-scenario). */
export async function applyLiveOccupancyNow(): Promise<{
  updated: number;
  kTotal: number;
  totalSpots: number;
}> {
  const now = DateTime.now().setZone(UNBSJ_TIMEZONE);
  const dateYmd = now.toFormat("yyyy-MM-dd");
  const timeHm = now.toFormat("HH:mm");
  return applyScenarioOccupancy(dateYmd, timeHm);
}

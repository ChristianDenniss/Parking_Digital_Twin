import { AppDataSource } from "../../db/data-source";
import { HistoricalProxyData } from "../historical/historical.entity";
import { ParkingLot } from "../parkingLots/parkingLot.entity";
import { LotOccupancyCorrection } from "./lotOccupancyCorrection.entity";
import {
  LotType,
  EventSize,
  PredictionConfidence,
  PredictionResult,
  DayProfileResult,
  PredictionOptions,
} from "./prediction.types";
import { getLotActivityIndex, computeLotActivityCurve } from "./activityCurve.service";
import { DateTime } from "luxon";
import { UNBSJ_TIMEZONE } from "../../utils/campusOccupancyProfile";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum DB samples needed before we trust historical averaging. */
const MIN_SAMPLES_FOR_DATA_CONFIDENCE = 3;

/** Base occupancy curves per lot type (0–1, typical weekday peak). */
const OCCUPANCY_CURVES: Record<LotType, number[]> = {
  //                  0     1     2     3     4     5     6     7     8     9    10    11    12    13    14    15    16    17    18    19    20    21    22    23
  general:  [0.05, 0.04, 0.03, 0.03, 0.04, 0.07, 0.15, 0.35, 0.65, 0.80, 0.85, 0.87, 0.82, 0.84, 0.86, 0.80, 0.65, 0.45, 0.30, 0.18, 0.12, 0.08, 0.06, 0.05],
  staff:    [0.04, 0.03, 0.02, 0.02, 0.03, 0.06, 0.20, 0.55, 0.82, 0.90, 0.92, 0.93, 0.91, 0.92, 0.91, 0.85, 0.70, 0.45, 0.20, 0.10, 0.06, 0.05, 0.04, 0.04],
  resident: [0.70, 0.72, 0.74, 0.75, 0.73, 0.65, 0.50, 0.38, 0.25, 0.20, 0.18, 0.18, 0.20, 0.20, 0.22, 0.28, 0.40, 0.55, 0.65, 0.70, 0.73, 0.74, 0.73, 0.71],
  timed:    [0.02, 0.02, 0.01, 0.01, 0.02, 0.05, 0.12, 0.30, 0.70, 0.88, 0.92, 0.90, 0.85, 0.88, 0.90, 0.85, 0.70, 0.45, 0.25, 0.12, 0.07, 0.04, 0.03, 0.02],
  phd:      [0.05, 0.04, 0.03, 0.03, 0.04, 0.08, 0.18, 0.40, 0.68, 0.78, 0.82, 0.83, 0.80, 0.82, 0.84, 0.78, 0.62, 0.42, 0.28, 0.16, 0.10, 0.07, 0.06, 0.05],
};

/** Weekday multiplier (baseline); applied on top of curve. */
const WEEKEND_MULTIPLIERS: Record<LotType, number> = {
  general: 0.22,
  staff: 0.08,
  resident: 0.85,
  timed: 0.18,
  phd: 0.15,
};

/** Academic calendar period multipliers. */
const PERIOD_MULTIPLIERS: Record<string, number> = {
  classes: 1.00,
  pre_semester: 0.45,
  reading_week: 0.55,
  exams: 0.70,
  holiday: 0.08,
  summer: 0.30,
};

/** Event boost: fraction of remaining capacity added as extra occupied stalls. */
const EVENT_BOOST: Record<EventSize, number> = {
  none: 0,
  small: 0.10,
  medium: 0.22,
  large: 0.38,
};

/** How sensitive each lot type is to events. */
const EVENT_LOT_SENSITIVITY: Record<LotType, number> = {
  timed: 1.2,
  general: 1.0,
  phd: 0.55,
  staff: 0.25,
  resident: 0.08,
};

/** Weekend events matter more (low baseline → events dominate). */
const WEEKEND_EVENT_MULTIPLIER = 1.45;

// ─── UNBSJ Academic calendar ─────────────────────────────────────────────────

interface CalendarEntry {
  start: string; // YYYY-MM-DD
  end: string;
  period: string;
}

const CALENDAR: CalendarEntry[] = [
  // 2024–2025
  { start: "2024-09-01", end: "2024-09-05", period: "pre_semester" },
  { start: "2024-09-09", end: "2024-10-18", period: "classes" },
  { start: "2024-10-14", end: "2024-10-14", period: "holiday" },
  { start: "2024-10-19", end: "2024-11-08", period: "classes" },
  { start: "2024-11-11", end: "2024-11-11", period: "holiday" },
  { start: "2024-11-12", end: "2024-12-06", period: "classes" },
  { start: "2024-12-07", end: "2024-12-08", period: "reading_week" },
  { start: "2024-12-09", end: "2024-12-20", period: "exams" },
  { start: "2024-12-21", end: "2025-01-05", period: "holiday" },
  { start: "2025-01-06", end: "2025-01-06", period: "pre_semester" },
  { start: "2025-01-07", end: "2025-02-21", period: "classes" },
  { start: "2025-02-17", end: "2025-02-17", period: "holiday" },
  { start: "2025-02-22", end: "2025-02-28", period: "reading_week" },
  { start: "2025-03-01", end: "2025-04-11", period: "classes" },
  { start: "2025-04-12", end: "2025-04-13", period: "reading_week" },
  { start: "2025-04-14", end: "2025-04-25", period: "exams" },
  { start: "2025-04-26", end: "2025-08-31", period: "summer" },
  // 2025–2026
  { start: "2025-09-01", end: "2025-09-05", period: "pre_semester" },
  { start: "2025-09-08", end: "2025-10-17", period: "classes" },
  { start: "2025-10-13", end: "2025-10-13", period: "holiday" },
  { start: "2025-10-18", end: "2025-11-10", period: "classes" },
  { start: "2025-11-11", end: "2025-11-11", period: "holiday" },
  { start: "2025-11-12", end: "2025-12-05", period: "classes" },
  { start: "2025-12-06", end: "2025-12-07", period: "reading_week" },
  { start: "2025-12-08", end: "2025-12-19", period: "exams" },
  { start: "2025-12-20", end: "2026-01-04", period: "holiday" },
  { start: "2026-01-05", end: "2026-01-05", period: "pre_semester" },
  { start: "2026-01-06", end: "2026-02-20", period: "classes" },
  { start: "2026-02-16", end: "2026-02-16", period: "holiday" },
  { start: "2026-02-21", end: "2026-02-27", period: "reading_week" },
  { start: "2026-02-28", end: "2026-04-10", period: "classes" },
  { start: "2026-04-11", end: "2026-04-12", period: "reading_week" },
  { start: "2026-04-13", end: "2026-04-24", period: "exams" },
  { start: "2026-04-25", end: "2026-12-31", period: "summer" },
];

function getSemesterPeriod(dateYmd: string): string {
  for (const entry of CALENDAR) {
    if (dateYmd >= entry.start && dateYmd <= entry.end) return entry.period;
  }
  return "summer";
}

function getLotType(lotName: string): LotType {
  const n = lotName.toLowerCase();
  if (n.includes("staff")) return "staff";
  if (n.includes("resident")) return "resident";
  if (n.includes("timed")) return "timed";
  if (n.includes("phd")) return "phd";
  return "general";
}

function isWeekend(dateYmd: string): boolean {
  const d = new Date(dateYmd + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Deterministic pseudo-random float in (0,1] seeded by a 32-bit integer. */
function seededRand(seed: number): number {
  // xorshift32
  let s = seed >>> 0;
  s ^= s << 13; s ^= s >> 17; s ^= s << 5;
  return ((s >>> 0) + 1) / 0x100000001;
}

/**
 * Seeded Gaussian noise — Box-Muller transform.
 * Using the lot ID and target timestamp as the seed means the same lot at the
 * same time always produces the same noise offset, so baseline numbers don't
 * change just because a different eventSize is selected.
 */
function gaussianNoise(sigma: number, seed: number): number {
  const u1 = seededRand(seed);
  const u2 = seededRand(seed ^ 0xdeadbeef);
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Historical DB query ──────────────────────────────────────────────────────

interface HistoricalSample {
  occupancyPct: number;
}

async function fetchHistoricalSamples(
  lotId: string,
  hour: number,
  dayOfWeek: number, // 0=Sun
  period: string,
): Promise<HistoricalSample[]> {
  const repo = AppDataSource.getRepository(HistoricalProxyData);
  const isPostgres = AppDataSource.options.type === "postgres";
  const hourWhere = isPostgres
    ? `EXTRACT(HOUR FROM h."recordedAt")::int = :hour`
    : "CAST(strftime('%H', h.recordedAt) AS INTEGER) = :hour";
  const dayWhere = isPostgres
    ? `EXTRACT(DOW FROM h."recordedAt")::int IN (:...days)`
    : "CAST(strftime('%w', h.recordedAt) AS INTEGER) IN (:...days)";
  const periodWhere = isPostgres
    ? `(h."metadata")::jsonb ->> 'period' = :period`
    : "json_extract(h.metadata, '$.period') = :period";

  // Match records within ±1 day-of-week and same semester period
  const rows = await repo
    .createQueryBuilder("h")
    .select(["h.occupancyPct"])
    .where("h.sourceName = :lotId", { lotId })
    .andWhere(hourWhere, { hour })
    .andWhere(dayWhere, {
      days: [
        (dayOfWeek + 6) % 7,
        dayOfWeek,
        (dayOfWeek + 1) % 7,
      ],
    })
    .andWhere(periodWhere, { period })
    .getMany();
  return rows.map((r) => ({ occupancyPct: r.occupancyPct }));
}

// ─── DDM residual lookup ──────────────────────────────────────────────────────

interface ResidualCorrection {
  meanResidual: number; // occupancy-% units, signed
  nSamples: number;
  weight: number;       // tanh(n/10), 0–1
}

async function fetchResidualCorrection(
  lotId: string,
  hour: number,
  dayOfWeek: number,
  period: string,
): Promise<ResidualCorrection | null> {
  const repo = AppDataSource.getRepository(LotOccupancyCorrection);
  const row = await repo.findOne({ where: { lotId, hour, dayOfWeek, period } });
  if (!row || row.nSamples < 1) return null;
  const weight = Math.tanh(row.nSamples / 10);
  return { meanResidual: row.meanResidual, nSamples: row.nSamples, weight };
}

// ─── Core builder ─────────────────────────────────────────────────────────────

interface BuildResult {
  occupancyPct: number;
  confidence: PredictionConfidence;
  eventBoost: number;
  enrollMultiplier: number;
  activityIndex: number;
}

function buildPrediction(
  lot: ParkingLot,
  targetDate: string,
  hour: number,
  samples: HistoricalSample[],
  options: PredictionOptions & { enrollmentActivityIndex?: number; residual?: ResidualCorrection | null },
): BuildResult {
  const lotType = getLotType(lot.name);
  const period = getSemesterPeriod(targetDate);
  const weekend = isWeekend(targetDate);

  // ── Step 1: base occupancy from DB or curve ──
  let baseOccupancy: number;
  let confidence: PredictionConfidence;

  if (samples.length >= MIN_SAMPLES_FOR_DATA_CONFIDENCE) {
    const avg =
      samples.reduce((s, r) => s + r.occupancyPct, 0) / samples.length;
    baseOccupancy = avg / 100; // normalise to 0–1
    confidence = "data";
  } else {
    const curveVal = OCCUPANCY_CURVES[lotType][hour] ?? 0.5;
    const periodMult = PERIOD_MULTIPLIERS[period] ?? 1.0;
    const weekMult = weekend ? WEEKEND_MULTIPLIERS[lotType] : 1.0;
    const raw = Math.min(1, curveVal * periodMult * weekMult);

    // ── DDM residual correction (hybrid layer) ──
    // Only applied to curve-based estimates (data-based have their own variance)
    // weight = tanh(n_samples/10): needs ~20 samples to reach 0.96 trust
    if (options.residual && options.residual.nSamples >= 1) {
      const correctionPct = options.residual.weight * options.residual.meanResidual;
      baseOccupancy = Math.min(1, Math.max(0, raw + correctionPct / 100));
    } else {
      baseOccupancy = raw;
    }
    confidence = "curve";
  }

  // ── Step 2: event boost ──
  const eventSize = options.eventSize ?? "none";
  const boost = EVENT_BOOST[eventSize];
  const sensitivity = EVENT_LOT_SENSITIVITY[lotType];
  const weekendBonus = weekend ? WEEKEND_EVENT_MULTIPLIER : 1.0;
  const eventBoost = boost * sensitivity * weekendBonus * (1 - baseOccupancy);
  const afterEvent = Math.min(1, baseOccupancy + eventBoost);

  // ── Step 3: enrollment multiplier ──
  let activityIndex = options.enrollmentActivityIndex ?? 0;
  if (weekend) activityIndex = Math.min(activityIndex, 0.3);
  const enrollMultiplier =
    options.useEnrollment && activityIndex > 0
      ? 0.85 + 0.30 * activityIndex
      : 1.0;
  const afterEnroll = Math.min(1, afterEvent * enrollMultiplier);

  // ── Step 4: Gaussian noise (only for curve; DB avg already has variance) ──
  // Seed from lot ID + date + hour so the same inputs always produce the same
  // noise offset — prevents baseline numbers from changing between requests.
  const noiseSeed = lot.id.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) ^
    parseInt(targetDate.replace(/-/g, ""), 10) ^ (hour * 0x9e3779b9);
  const noise = confidence === "curve" ? gaussianNoise(0.04, noiseSeed) : gaussianNoise(0.015, noiseSeed);
  const final = Math.min(1, Math.max(0, afterEnroll + noise));

  return {
    occupancyPct: final * 100,
    confidence,
    eventBoost: eventBoost * 100,
    enrollMultiplier,
    activityIndex,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function predictOccupancy(
  lotId: string,
  targetDatetime: Date,
  options: PredictionOptions & { enrollmentActivityIndex?: number } = {},
): Promise<PredictionResult | null> {
  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const lot = await lotRepo.findOne({ where: { id: lotId } });
  if (!lot) return null;

  const local = DateTime.fromJSDate(targetDatetime).setZone(UNBSJ_TIMEZONE);
  const dateYmd = local.toFormat("yyyy-MM-dd");
  const hour = local.hour;
  const dayOfWeek = local.weekday % 7; // Luxon: 1=Mon…7=Sun → 0=Sun,1=Mon…6=Sat
  const period = getSemesterPeriod(dateYmd);

  // Resolve enrollment activity index if not pre-supplied
  const enrollmentActivityIndex =
    options.enrollmentActivityIndex !== undefined
      ? options.enrollmentActivityIndex
      : options.useEnrollment
        ? await getLotActivityIndex(lotId, hour, options.termCodes)
        : 0;

  const [samples, residual] = await Promise.all([
    fetchHistoricalSamples(lotId, hour, dayOfWeek, period),
    fetchResidualCorrection(lotId, hour, dayOfWeek, period),
  ]);
  const result = buildPrediction(lot, dateYmd, hour, samples, { ...options, enrollmentActivityIndex, residual });

  const freePct = Math.max(0, 100 - result.occupancyPct) / 100;
  const freeSpots = Math.round(freePct * lot.capacity);

  return {
    lotId: lot.id,
    lotName: lot.name,
    lotType: getLotType(lot.name),
    predictedOccupancyPct: Math.round(result.occupancyPct * 10) / 10,
    predictedFreeSpots: freeSpots,
    confidence: result.confidence,
    targetAt: targetDatetime.toISOString(),
    forecastedAt: new Date().toISOString(),
    event: {
      size: options.eventSize ?? "none",
      appliedBoost: Math.round(result.eventBoost * 10) / 10,
    },
    enrollment: {
      applied: options.useEnrollment === true && result.activityIndex > 0,
      activityIndex: Math.round(result.activityIndex * 100) / 100,
      multiplier: Math.round(result.enrollMultiplier * 100) / 100,
    },
  };
}

export async function predictDayProfile(
  lotId: string,
  dateYmd: string,
  options: PredictionOptions & { enrollmentActivityIndexByHour?: number[] } = {},
): Promise<DayProfileResult | null> {
  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const lot = await lotRepo.findOne({ where: { id: lotId } });
  if (!lot) return null;

  const d = new Date(dateYmd + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay();
  const period = getSemesterPeriod(dateYmd);

  // Pre-fetch full 24-hour activity curve in one query rather than 24 separate calls
  const activityCurve: number[] =
    options.useEnrollment
      ? (options.enrollmentActivityIndexByHour ?? await computeLotActivityCurve(lotId, options.termCodes))
      : new Array(24).fill(0);

  const hours = await Promise.all(
    Array.from({ length: 24 }, async (_, hour) => {
      const samples = await fetchHistoricalSamples(lotId, hour, dayOfWeek, period);
      const activityIndex = activityCurve[hour] ?? 0;
      const result = buildPrediction(lot, dateYmd, hour, samples, {
        ...options,
        enrollmentActivityIndex: activityIndex,
      });
      return {
        hour,
        predictedOccupancyPct: Math.round(result.occupancyPct * 10) / 10,
        confidence: result.confidence,
      };
    }),
  );

  return { lotId: lot.id, lotName: lot.name, date: dateYmd, hours };
}

export async function predictSnapshot(
  targetDatetime: Date,
  options: PredictionOptions = {},
): Promise<PredictionResult[]> {
  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const lots = await lotRepo.find({ order: { createdAt: "ASC" } });
  const results = await Promise.all(
    lots.map((lot) => predictOccupancy(lot.id, targetDatetime, options)),
  );
  return results.filter((r): r is PredictionResult => r != null);
}

export async function predictNextHours(
  lotId: string,
  from: Date,
  hoursAhead: number,
  options: PredictionOptions = {},
): Promise<PredictionResult[]> {
  const results: PredictionResult[] = [];
  for (let i = 0; i < hoursAhead; i++) {
    const target = new Date(from.getTime() + i * 60 * 60 * 1000);
    const r = await predictOccupancy(lotId, target, options);
    if (r) results.push(r);
  }
  return results;
}

// ─── Helpers (exported for use in Phase 3/4) ─────────────────────────────────

export { getLotType, getSemesterPeriod, isWeekend };

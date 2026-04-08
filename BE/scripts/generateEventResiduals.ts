/**
 * generateEventResiduals.ts — Task 2b
 *
 * Computes event-specific and weekend-specific DDM residual corrections from
 * historical records that have been tagged with { eventSize: "small"|"medium"|"large" }
 * or recorded on weekend days.
 *
 * Results are upserted into lot_occupancy_corrections using the period field
 * prefixed with "event_<size>_" for event slots, and "weekend_" for weekend slots.
 * This lets the prediction engine distinguish between:
 *   - "classes" (normal weekday)
 *   - "event_small_classes", "event_medium_classes", "event_large_classes"
 *   - "weekend_<period>" (weekend-specific correction)
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/generateEventResiduals.ts
 */

import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import { HistoricalProxyData } from "../src/modules/historical/historical.entity";
import { LotOccupancyCorrection } from "../src/modules/prediction/lotOccupancyCorrection.entity";

type LotType = "general" | "staff" | "resident" | "timed" | "phd";

const OCCUPANCY_CURVES: Record<LotType, number[]> = {
  general:  [0.05,0.04,0.03,0.03,0.04,0.07,0.15,0.35,0.65,0.80,0.85,0.87,0.82,0.84,0.86,0.80,0.65,0.45,0.30,0.18,0.12,0.08,0.06,0.05],
  staff:    [0.04,0.03,0.02,0.02,0.03,0.06,0.20,0.55,0.82,0.90,0.92,0.93,0.91,0.92,0.91,0.85,0.70,0.45,0.20,0.10,0.06,0.05,0.04,0.04],
  resident: [0.70,0.72,0.74,0.75,0.73,0.65,0.50,0.38,0.25,0.20,0.18,0.18,0.20,0.20,0.22,0.28,0.40,0.55,0.65,0.70,0.73,0.74,0.73,0.71],
  timed:    [0.02,0.02,0.01,0.01,0.02,0.05,0.12,0.30,0.70,0.88,0.92,0.90,0.85,0.88,0.90,0.85,0.70,0.45,0.25,0.12,0.07,0.04,0.03,0.02],
  phd:      [0.05,0.04,0.03,0.03,0.04,0.08,0.18,0.40,0.68,0.78,0.82,0.83,0.80,0.82,0.84,0.78,0.62,0.42,0.28,0.16,0.10,0.07,0.06,0.05],
};

const PERIOD_MULTIPLIERS: Record<string, number> = {
  classes: 1.00, pre_semester: 0.45, reading_week: 0.55,
  exams: 0.70, holiday: 0.08, summer: 0.30,
};
const WEEKEND_MULTIPLIERS: Record<LotType, number> = {
  general: 0.22, staff: 0.08, resident: 0.85, timed: 0.18, phd: 0.15,
};
const CALENDAR: Array<{ start: string; end: string; period: string }> = [
  { start: "2025-01-06", end: "2026-04-24", period: "classes" }, // simplified — full list in generateResiduals.ts
  { start: "2026-04-25", end: "2026-12-31", period: "summer" },
];

function getPeriod(dateYmd: string): string {
  for (const e of CALENDAR) {
    if (dateYmd >= e.start && dateYmd <= e.end) return e.period;
  }
  return "summer";
}
function getLotType(name: string): LotType {
  const n = name.toLowerCase();
  if (n.includes("staff")) return "staff";
  if (n.includes("resident")) return "resident";
  if (n.includes("timed")) return "timed";
  if (n.includes("phd")) return "phd";
  return "general";
}
function getCurveValue(lotType: LotType, hour: number, period: string, weekend: boolean): number {
  const curveVal = OCCUPANCY_CURVES[lotType][hour] ?? 0.5;
  const periodMult = PERIOD_MULTIPLIERS[period] ?? 1.0;
  const weekMult = weekend ? WEEKEND_MULTIPLIERS[lotType] : 1.0;
  return Math.min(1, curveVal * periodMult * weekMult) * 100;
}

// Minimum event samples before we trust the correction (lower threshold for events due to rarity)
const MIN_EVENT_SAMPLES = 2;

async function main() {
  await AppDataSource.initialize();
  const histRepo = AppDataSource.getRepository(HistoricalProxyData);
  const corrRepo = AppDataSource.getRepository(LotOccupancyCorrection);

  const allRecords = await histRepo.find();
  console.log(`Processing ${allRecords.length} records for event/weekend corrections…`);

  type Key = string;
  const groups = new Map<Key, { residuals: number[] }>();

  for (const r of allRecords) {
    const dt = new Date(r.recordedAt);
    const hour = dt.getUTCHours();
    const dow = dt.getUTCDay();
    const dateYmd = dt.toISOString().slice(0, 10);
    const basePeriod = getPeriod(dateYmd);
    const weekend = dow === 0 || dow === 6;

    const metaEventSize = (r.metadata as Record<string, unknown> | null)?.eventSize as string | undefined;
    const isEvent = metaEventSize && metaEventSize !== "none";

    // Build a special period key to separate event/weekend corrections
    let effectivePeriod: string;
    if (isEvent) {
      effectivePeriod = `event_${metaEventSize}_${basePeriod}`;
    } else if (weekend) {
      effectivePeriod = `weekend_${basePeriod}`;
    } else {
      continue; // Normal weekday records handled by generateResiduals.ts
    }

    const lotType = getLotType(r.sourceName);
    const curveValue = getCurveValue(lotType, hour, basePeriod, weekend);
    const residual = r.occupancyPct - curveValue;

    const key = `${r.sourceName}|${hour}|${dow}|${effectivePeriod}`;
    let g = groups.get(key);
    if (!g) { g = { residuals: [] }; groups.set(key, g); }
    g.residuals.push(residual);
  }

  console.log(`Computed event/weekend residuals for ${groups.size} slots`);

  let written = 0;
  for (const [key, { residuals }] of groups) {
    if (residuals.length < MIN_EVENT_SAMPLES) continue;
    const [lotId, hourStr, dowStr, period] = key.split("|") as [string, string, string, string];
    const meanResidual = residuals.reduce((a, b) => a + b, 0) / residuals.length;

    let row = await corrRepo.findOne({ where: { lotId, hour: Number(hourStr), dayOfWeek: Number(dowStr), period } });
    if (!row) {
      row = corrRepo.create({ lotId, hour: Number(hourStr), dayOfWeek: Number(dowStr), period, meanResidual, nSamples: residuals.length });
    } else {
      row.meanResidual = meanResidual;
      row.nSamples = residuals.length;
    }
    await corrRepo.save(row);
    written++;
  }

  console.log(`Written/updated ${written} event/weekend correction rows`);
  await AppDataSource.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });

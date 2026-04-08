/**
 * generateResiduals.ts
 *
 * Hybrid model (DDM) residual-correction generator.
 *
 * Reads all historical_proxy_data records, computes per-lot-hour-dow-period
 * residuals (observed − curve), and writes them to lot_occupancy_corrections.
 *
 * Run once after collecting several weeks of data, then re-run periodically
 * (e.g. weekly cron) to keep corrections current.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/generateResiduals.ts
 */

import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import { HistoricalProxyData } from "../src/modules/historical/historical.entity";
import { LotOccupancyCorrection } from "../src/modules/prediction/lotOccupancyCorrection.entity";

// ─── Curve (must match prediction.service.ts) ────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await AppDataSource.initialize();
  console.log("DB connected");

  const histRepo = AppDataSource.getRepository(HistoricalProxyData);
  const corrRepo = AppDataSource.getRepository(LotOccupancyCorrection);

  // Fetch all non-event historical records (event-tagged records are handled separately in 2b)
  const records = await histRepo
    .createQueryBuilder("h")
    .where("json_extract(h.metadata, '$.eventSize') IS NULL OR json_extract(h.metadata, '$.eventSize') = 'none'")
    .getMany();

  console.log(`Processing ${records.length} non-event historical records…`);

  // Group by (sourceName, hour, dayOfWeek, period)
  type Key = string;
  const groups = new Map<Key, { residuals: number[] }>();

  for (const r of records) {
    const dt = new Date(r.recordedAt);
    const hour = dt.getUTCHours();
    const dow = dt.getUTCDay();
    const dateYmd = dt.toISOString().slice(0, 10);
    const period = getPeriod(dateYmd);
    const weekend = dow === 0 || dow === 6;

    const lotType = getLotType(r.sourceName);
    const curveValue = getCurveValue(lotType, hour, period, weekend);
    const residual = r.occupancyPct - curveValue;

    const key = `${r.sourceName}|${hour}|${dow}|${period}`;
    let g = groups.get(key);
    if (!g) { g = { residuals: [] }; groups.set(key, g); }
    g.residuals.push(residual);
  }

  console.log(`Computed residuals for ${groups.size} slots`);

  let written = 0;
  for (const [key, { residuals }] of groups) {
    if (residuals.length === 0) continue;
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

  console.log(`Written/updated ${written} correction rows`);
  await AppDataSource.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });

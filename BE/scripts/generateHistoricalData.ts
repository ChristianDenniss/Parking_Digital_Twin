/**
 * Generates synthetic historical occupancy records into historical_proxy_data.
 * Uses pplOnCampusByTime.json as the demand signal, applies per-lot-type
 * multipliers and academic-calendar multipliers, then adds Gaussian noise.
 *
 * Usage:
 *   npm run gen-historical          # append (skip if records already exist for a lot)
 *   npm run gen-historical-clear    # clear table first, then generate
 */

import "reflect-metadata";
import path from "path";
import fs from "fs";
import { DataSource } from "typeorm";
import { HistoricalProxyData } from "../src/modules/historical/historical.entity";
import { ParkingLot } from "../src/modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../src/modules/parkingSpots/parkingSpot.entity";
import { ParkingSpotLog } from "../src/modules/parkingSpotLogs/parkingSpotLog.entity";
import { User } from "../src/modules/users/user.entity";
import { Student } from "../src/modules/students/student.entity";
import { Course } from "../src/modules/classes/course.entity";
import { ClassSchedule } from "../src/modules/classSchedule/classSchedule.entity";
import { Building } from "../src/modules/buildings/building.entity";
import { LotBuildingDistance } from "../src/modules/buildings/lotBuildingDistance.entity";

// ─── Types ────────────────────────────────────────────────────────────────────

type LotType = "general" | "staff" | "resident" | "timed" | "phd";

interface WinterSlot {
  slotStart: string;
  carsOnCampusMidpoint: number;
}

// ─── Occupancy curves (0–1 per hour, typical weekday) ─────────────────────────

const OCCUPANCY_CURVES: Record<LotType, number[]> = {
  general:  [0.05,0.04,0.03,0.03,0.04,0.07,0.15,0.35,0.65,0.80,0.85,0.87,0.82,0.84,0.86,0.80,0.65,0.45,0.30,0.18,0.12,0.08,0.06,0.05],
  staff:    [0.04,0.03,0.02,0.02,0.03,0.06,0.20,0.55,0.82,0.90,0.92,0.93,0.91,0.92,0.91,0.85,0.70,0.45,0.20,0.10,0.06,0.05,0.04,0.04],
  resident: [0.70,0.72,0.74,0.75,0.73,0.65,0.50,0.38,0.25,0.20,0.18,0.18,0.20,0.20,0.22,0.28,0.40,0.55,0.65,0.70,0.73,0.74,0.73,0.71],
  timed:    [0.02,0.02,0.01,0.01,0.02,0.05,0.12,0.30,0.70,0.88,0.92,0.90,0.85,0.88,0.90,0.85,0.70,0.45,0.25,0.12,0.07,0.04,0.03,0.02],
  phd:      [0.05,0.04,0.03,0.03,0.04,0.08,0.18,0.40,0.68,0.78,0.82,0.83,0.80,0.82,0.84,0.78,0.62,0.42,0.28,0.16,0.10,0.07,0.06,0.05],
};

const WEEKEND_MULTIPLIERS: Record<LotType, number> = {
  general: 0.22, staff: 0.08, resident: 0.85, timed: 0.18, phd: 0.15,
};

// ─── Academic calendar ────────────────────────────────────────────────────────

interface CalEntry { start: string; end: string; period: string }

const CALENDAR: CalEntry[] = [
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

const PERIOD_MULTIPLIERS: Record<string, number> = {
  classes: 1.00, pre_semester: 0.45, reading_week: 0.55,
  exams: 0.70, holiday: 0.08, summer: 0.30,
};

function getPeriod(ymd: string): string {
  for (const e of CALENDAR) if (ymd >= e.start && ymd <= e.end) return e.period;
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

function isWeekend(d: Date): boolean {
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

function gaussianNoise(sigma: number): number {
  const u1 = Math.random(), u2 = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

// ─── Load pplOnCampusByTime for a richer demand signal ────────────────────────

interface PplFile { winter2026: { slots: WinterSlot[] } }

function loadPplSlots(): WinterSlot[] {
  const p = path.join(__dirname, "../data/pplOnCampusByTime.json");
  if (!fs.existsSync(p)) return [];
  const f = JSON.parse(fs.readFileSync(p, "utf-8")) as PplFile;
  return f.winter2026?.slots ?? [];
}

function carsAtHour(slots: WinterSlot[], hour: number): number {
  const match = slots.find((s) => {
    const [h] = s.slotStart.split(":").map(Number);
    return h === hour;
  });
  return match?.carsOnCampusMidpoint ?? 0;
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const dbPath = path.join(__dirname, "../data/database.sqlite");
const ds = new DataSource({
  type: "better-sqlite3",
  database: dbPath,
  synchronize: true,
  logging: false,
  entities: [
    ParkingLot, ParkingSpot, ParkingSpotLog, HistoricalProxyData,
    User, Student, Course, ClassSchedule, Building, LotBuildingDistance,
  ],
  migrations: [],
  subscribers: [],
});

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const clear = process.argv.includes("--clear");
  await ds.initialize();
  const histRepo = ds.getRepository(HistoricalProxyData);
  const lotRepo  = ds.getRepository(ParkingLot);

  if (clear) {
    await histRepo.clear();
    console.log("Cleared historical_proxy_data table.");
  }

  const lots = await lotRepo.find();
  if (lots.length === 0) {
    console.error("No parking lots found – run npm run seed first.");
    process.exit(1);
  }

  const pplSlots = loadPplSlots();
  const totalCarsAtPeak = Math.max(...pplSlots.map((s) => s.carsOnCampusMidpoint), 1);
  const totalSpots = lots.reduce((s, l) => s + l.capacity, 0);

  // Date range: Sep 2024 – Apr 2026
  const start = new Date("2024-09-01T00:00:00Z");
  const end   = new Date("2026-04-25T00:00:00Z");

  let total = 0;
  const BATCH = 500;
  const batch: Partial<HistoricalProxyData>[] = [];

  async function flush() {
    if (batch.length === 0) return;
    await histRepo.insert(batch as HistoricalProxyData[]);
    total += batch.length;
    batch.length = 0;
  }

  console.log(`Generating records for ${lots.length} lots from ${start.toISOString().slice(0,10)} to ${end.toISOString().slice(0,10)}…`);

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const ymd = d.toISOString().slice(0, 10);
    const period = getPeriod(ymd);
    const weekend = isWeekend(d);
    const periodMult = PERIOD_MULTIPLIERS[period] ?? 1.0;

    for (const lot of lots) {
      const lotType = getLotType(lot.name);
      const curve = OCCUPANCY_CURVES[lotType];
      const weekMult = weekend ? WEEKEND_MULTIPLIERS[lotType] : 1.0;

      for (let hour = 0; hour < 24; hour++) {
        // Blend curve value with normalised campus car count (gives pplOnCampusByTime influence)
        const carsNow = carsAtHour(pplSlots, hour);
        const carsRatio = totalSpots > 0 ? Math.min(1, carsNow / totalSpots) : 0;
        const curveVal  = (curve[hour] ?? 0.5) * periodMult * weekMult;
        // 60% curve (lot-type shape) + 40% campus demand signal
        const blended = 0.60 * curveVal + 0.40 * carsRatio * periodMult * weekMult;
        const noise = gaussianNoise(0.04);
        const occupancyPct = Math.min(100, Math.max(0, (blended + noise) * 100));

        const recordedAt = new Date(d);
        recordedAt.setUTCHours(hour, 0, 0, 0);

        batch.push({
          sourceName: lot.id,
          recordedAt,
          occupancyPct,
          snapshot: null,
          metadata: JSON.stringify({
            lotName: lot.name,
            lotType,
            period,
            weekend,
            hour,
          }) as unknown as Record<string, unknown>,
        });

        if (batch.length >= BATCH) await flush();
      }
    }
  }

  await flush();
  console.log(`Done. Inserted ${total} records.`);
  await ds.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });

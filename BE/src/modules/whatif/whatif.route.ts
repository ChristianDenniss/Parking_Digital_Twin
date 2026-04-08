import { Router, Request, Response } from "express";
import { DateTime } from "luxon";
import { In } from "typeorm";
import { predictSnapshot } from "../prediction/prediction.service";
import type { EventSize, PredictionResult } from "../prediction/prediction.types";
import { cacheMiddleware } from "../../middleware/cache";
import { AppDataSource } from "../../db/data-source";
import { ParkingLot } from "../parkingLots/parkingLot.entity";
import { getParkingForecastSummary } from "../parkingSpots/parkingOccupancyAssign.service";
import { getLotType } from "../prediction/prediction.service";

const UNBSJ_TIMEZONE = "America/Moncton";

function parseEventSize(raw: unknown): EventSize {
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  return "none";
}

export interface WhatIfLotResult {
  lotId: string;
  lotName: string;
  lotType: string;
  baseline: { occupancyPct: number; freeSpots: number; confidence: string };
  scenario: { occupancyPct: number; freeSpots: number; confidence: string };
  delta: { occupancyPct: number; freeSpots: number };
}

export interface WhatIfResponse {
  date: string;
  time: string;
  dayOfWeek: string;
  eventSize: EventSize;
  useEnrollment: boolean;
  targetAt: string;
  lots: WhatIfLotResult[];
  summary: {
    totalBaselineFreeSpots: number;
    totalScenarioFreeSpots: number;
    totalCapacity: number;
    baselineOccupancyPct: number;
    scenarioOccupancyPct: number;
  };
}

const router = Router();

/** GET /api/what-if?date=YYYY-MM-DD&time=HH:MM&eventSize=none|small|medium|large&useEnrollment=true */
router.get("/", cacheMiddleware({ ttlSeconds: 120 }), async (req: Request, res: Response): Promise<void> => {
  try {
    const now = DateTime.now().setZone(UNBSJ_TIMEZONE);
    const dateStr = typeof req.query.date === "string" && req.query.date.trim()
      ? req.query.date.trim()
      : now.toFormat("yyyy-MM-dd");
    const timeStr = typeof req.query.time === "string" && req.query.time.trim()
      ? req.query.time.trim()
      : now.toFormat("HH:00");

    const [hh, mm] = timeStr.split(":").map(Number);
    const dt = DateTime.fromObject(
      { year: parseInt(dateStr.slice(0, 4)), month: parseInt(dateStr.slice(5, 7)), day: parseInt(dateStr.slice(8, 10)), hour: hh ?? 0, minute: mm ?? 0 },
      { zone: UNBSJ_TIMEZONE },
    );
    if (!dt.isValid) { res.status(400).json({ error: "Invalid date or time" }); return; }

    const eventSize = parseEventSize(req.query.eventSize);
    const useEnrollment = req.query.useEnrollment !== "false";
    const dayOfWeek = dt.toFormat("cccc"); // e.g. "Tuesday"

    // Baseline should match the map forecast path exactly (deterministic snapshot).
    const baselineForecast = await getParkingForecastSummary(dateStr, timeStr);
    const baselineByLot = new Map(
      baselineForecast.lots.map((l) => [l.parkingLotId, l]),
    );

    const targetAt = dt.toJSDate();
    const scenario = eventSize === "none"
      ? []
      : await predictSnapshot(targetAt, { eventSize, useEnrollment });
    const scenarioMap = new Map<string, PredictionResult>(
      scenario.map((s) => [s.lotId, s]),
    );

    const lotIds = eventSize === "none"
      ? baselineForecast.lots.map((l) => l.parkingLotId)
      : [...new Set([...baselineByLot.keys(), ...scenarioMap.keys()])];

    const lots: WhatIfLotResult[] = lotIds.map((lotId) => {
      const b = baselineByLot.get(lotId);
      const s = scenarioMap.get(lotId);
      const lotName = s?.lotName ?? b?.name ?? lotId;
      const baseOcc = b?.predictedOccupancyPercent ?? s?.predictedOccupancyPct ?? 0;
      const baseFree = b?.predictedFree ?? s?.predictedFreeSpots ?? 0;
      const scenOcc = s?.predictedOccupancyPct ?? baseOcc;
      const scenFree = s?.predictedFreeSpots ?? baseFree;
      return {
        lotId,
        lotName,
        lotType: s?.lotType ?? getLotType(lotName),
        baseline: { occupancyPct: baseOcc, freeSpots: baseFree, confidence: "deterministic" },
        scenario: { occupancyPct: scenOcc, freeSpots: scenFree, confidence: s?.confidence ?? "deterministic" },
        delta: { occupancyPct: scenOcc - baseOcc, freeSpots: scenFree - baseFree },
      };
    });

    const lotRepo = AppDataSource.getRepository(ParkingLot);
    const lotRows = lots.length > 0
      ? await lotRepo.find({ where: { id: In(lots.map((l) => l.lotId)) }, select: ["id", "capacity"] })
      : [];
    const capacityByLotId = new Map(lotRows.map((r) => [r.id, r.capacity]));

    const totalBaselineFree = eventSize === "none"
      ? baselineForecast.totalSpots - baselineForecast.kTotal
      : lots.reduce((s, l) => s + l.baseline.freeSpots, 0);
    const totalScenarioFree = lots.reduce((s, l) => s + l.scenario.freeSpots, 0);
    const totalCapacity = eventSize === "none"
      ? baselineForecast.totalSpots
      : lots.reduce((s, l) => s + (capacityByLotId.get(l.lotId) ?? 0), 0);

    const response: WhatIfResponse = {
      date: dateStr,
      time: timeStr,
      dayOfWeek,
      eventSize,
      useEnrollment,
      targetAt: dt.toISO()!,
      lots,
      summary: {
        totalBaselineFreeSpots: totalBaselineFree,
        totalScenarioFreeSpots: totalScenarioFree,
        totalCapacity,
        baselineOccupancyPct: eventSize === "none"
          ? baselineForecast.campusPredictedOccupancyPercent
          : totalCapacity > 0 ? Math.round((1 - totalBaselineFree / totalCapacity) * 100) : 0,
        scenarioOccupancyPct: totalCapacity > 0 ? Math.round((1 - totalScenarioFree / totalCapacity) * 100) : 0,
      },
    };

    res.json(response);
  } catch (err) {
    console.error("[what-if]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

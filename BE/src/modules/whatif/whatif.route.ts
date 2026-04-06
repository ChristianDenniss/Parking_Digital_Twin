import { Router, Request, Response } from "express";
import { DateTime } from "luxon";
import { predictSnapshot } from "../prediction/prediction.service";
import type { EventSize, PredictionResult } from "../prediction/prediction.types";
import { cacheMiddleware } from "../../middleware/cache";

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

    const targetAt = dt.toJSDate();
    const eventSize = parseEventSize(req.query.eventSize);
    const useEnrollment = req.query.useEnrollment !== "false";
    const dayOfWeek = dt.toFormat("cccc"); // e.g. "Tuesday"

    // Run baseline (no event, no enrollment) and scenario in parallel
    const [baseline, scenario] = await Promise.all([
      predictSnapshot(targetAt, { eventSize: "none", useEnrollment: false }),
      predictSnapshot(targetAt, { eventSize, useEnrollment }),
    ]);

    const baselineMap = new Map<string, PredictionResult>(baseline.map((r) => [r.lotId, r]));

    const lots: WhatIfLotResult[] = scenario.map((s) => {
      const b = baselineMap.get(s.lotId);
      const baseOcc = b?.predictedOccupancyPct ?? s.predictedOccupancyPct;
      const baseFree = b?.predictedFreeSpots ?? s.predictedFreeSpots;
      return {
        lotId: s.lotId,
        lotName: s.lotName,
        lotType: s.lotType,
        baseline: { occupancyPct: baseOcc, freeSpots: baseFree, confidence: b?.confidence ?? s.confidence },
        scenario: { occupancyPct: s.predictedOccupancyPct, freeSpots: s.predictedFreeSpots, confidence: s.confidence },
        delta: { occupancyPct: s.predictedOccupancyPct - baseOcc, freeSpots: s.predictedFreeSpots - baseFree },
      };
    });

    const totalBaselineFree = lots.reduce((s, l) => s + l.baseline.freeSpots, 0);
    const totalScenarioFree = lots.reduce((s, l) => s + l.scenario.freeSpots, 0);
    const totalCapacity = lots.reduce((s, l) => s + l.baseline.freeSpots + (100 - l.baseline.occupancyPct) > 0
      ? s + Math.round(l.baseline.freeSpots / (1 - l.baseline.occupancyPct / 100))
      : s, 0);

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
        baselineOccupancyPct: totalCapacity > 0 ? Math.round((1 - totalBaselineFree / totalCapacity) * 100) : 0,
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

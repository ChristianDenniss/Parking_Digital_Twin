import { Request, Response } from "express";
import { DateTime } from "luxon";
import {
  predictOccupancy,
  predictDayProfile,
  predictNextHours,
  predictSnapshot,
} from "./prediction.service";
import type { EventSize, PredictionOptions } from "./prediction.types";

const UNBSJ_TIMEZONE = "America/Moncton";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEventSize(raw: unknown): EventSize {
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  return "none";
}

function parseTermCodes(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseBool(raw: unknown): boolean {
  return raw === "true" || raw === "1";
}

function parseOptions(query: Request["query"]): PredictionOptions {
  return {
    eventSize: parseEventSize(query.eventSize),
    useEnrollment: parseBool(query.useEnrollment),
    termCodes: parseTermCodes(query.termCodes),
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /api/prediction/lots/:lotId?date=YYYY-MM-DD&time=HH:mm&eventSize=&useEnrollment= */
export async function predictOne(req: Request, res: Response): Promise<void> {
  try {
    const { lotId } = req.params;
    const now = DateTime.now().setZone(UNBSJ_TIMEZONE);
    const dateStr = typeof req.query.date === "string" ? req.query.date : now.toFormat("yyyy-MM-dd");
    const timeStr = typeof req.query.time === "string" ? req.query.time : now.toFormat("HH") + ":00";
    const [h, m] = timeStr.split(":").map(Number);
    const target = new Date(`${dateStr}T${String(h ?? 0).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}:00Z`);
    if (isNaN(target.getTime())) { res.status(400).json({ error: "Invalid date/time" }); return; }

    const options = parseOptions(req.query);
    const result = await predictOccupancy(lotId!, target, options);
    if (!result) { res.status(404).json({ error: "Lot not found" }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Prediction failed", detail: String(err) });
  }
}

/** GET /api/prediction/lots/:lotId/day-profile?date=YYYY-MM-DD&eventSize=&useEnrollment= */
export async function predictDayProfileHandler(req: Request, res: Response): Promise<void> {
  try {
    const { lotId } = req.params;
    const dateStr = typeof req.query.date === "string" ? req.query.date : DateTime.now().setZone(UNBSJ_TIMEZONE).toFormat("yyyy-MM-dd");
    const options = parseOptions(req.query);
    const result = await predictDayProfile(lotId!, dateStr, options);
    if (!result) { res.status(404).json({ error: "Lot not found" }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Prediction failed", detail: String(err) });
  }
}

/** GET /api/prediction/lots/:lotId/next-hours?from=ISO&hoursAhead=N&eventSize=&useEnrollment= */
export async function predictNextHoursHandler(req: Request, res: Response): Promise<void> {
  try {
    const { lotId } = req.params;
    const fromStr = typeof req.query.from === "string" ? req.query.from : new Date().toISOString();
    const from = new Date(fromStr);
    if (isNaN(from.getTime())) { res.status(400).json({ error: "Invalid from datetime" }); return; }
    const hoursAhead = Math.min(48, Math.max(1, parseInt(String(req.query.hoursAhead ?? "6"), 10)));
    const options = parseOptions(req.query);
    const results = await predictNextHours(lotId!, from, hoursAhead, options);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Prediction failed", detail: String(err) });
  }
}

/** GET /api/prediction/snapshot?datetime=ISO&eventSize=&useEnrollment= */
export async function predictSnapshotHandler(req: Request, res: Response): Promise<void> {
  try {
    const dtStr = typeof req.query.datetime === "string" ? req.query.datetime : new Date().toISOString();
    const dt = new Date(dtStr);
    if (isNaN(dt.getTime())) { res.status(400).json({ error: "Invalid datetime" }); return; }
    const options = parseOptions(req.query);
    const results = await predictSnapshot(dt, options);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Prediction failed", detail: String(err) });
  }
}

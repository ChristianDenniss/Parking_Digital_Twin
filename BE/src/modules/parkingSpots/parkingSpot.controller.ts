import { Request, Response } from "express";
import * as parkingSpotService from "./parkingSpot.service";
import * as parkingOccupancyAssign from "./parkingOccupancyAssign.service";
import { createParkingSpotSchema, updateParkingSpotStatusSchema } from "./parkingSpot.schema";
import { validate } from "../../utils/validate";
import { onScenarioApplied, setSimulatorState } from "../simulator";

export async function list(req: Request, res: Response) {
  const parkingLotId = (req.query.parkingLotId as string) || null;
  const section = (req.query.section as string) || null;
  const spots = await parkingSpotService.findAll({ parkingLotId, section });
  res.json(spots);
}

export async function getById(req: Request, res: Response) {
  const spot = await parkingSpotService.findById(req.params.id);
  if (!spot) return res.status(404).json({ error: "Parking spot not found" });
  res.json(spot);
}

export async function updateStatus(req: Request, res: Response) {
  const result = validate(updateParkingSpotStatusSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const spot = await parkingSpotService.updateStatus(req.params.id, result.data!.status);
  if (!spot) return res.status(404).json({ error: "Parking spot not found" });
  res.json(spot);
}

export async function create(req: Request, res: Response) {
  const result = validate(createParkingSpotSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const spot = await parkingSpotService.create(result.data!);
  res.status(201).json(spot);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

export async function applyScenario(req: Request, res: Response) {
  const date = typeof req.body?.date === "string" ? req.body.date.trim() : "";
  const time = typeof req.body?.time === "string" ? req.body.time.trim() : "";
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    return res.status(400).json({ error: "Body must include date (YYYY-MM-DD) and time (HH:mm)" });
  }
  try {
    const result = await parkingOccupancyAssign.applyScenarioOccupancy(date, time);
    onScenarioApplied(date, time);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "apply-scenario failed";
    res.status(400).json({ error: msg });
  }
}

export async function applyLive(_req: Request, res: Response) {
  try {
    const result = await parkingOccupancyAssign.applyLiveOccupancyNow();
    setSimulatorState({ mapMode: "live", paused: false });
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "apply-live failed";
    res.status(400).json({ error: msg });
  }
}

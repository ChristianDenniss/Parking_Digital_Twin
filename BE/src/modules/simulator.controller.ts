import { Request, Response } from "express";
import { getSimulatorState, setSimulatorState, type SimulatorMapMode } from "./simulator";

export function getState(_req: Request, res: Response) {
  res.json(getSimulatorState());
}

export function postState(req: Request, res: Response) {
  const body = req.body as {
    paused?: boolean;
    mapMode?: string;
    scenarioDate?: string | null;
    scenarioTime?: string | null;
  };
  const patch: Parameters<typeof setSimulatorState>[0] = {};
  if (typeof body.paused === "boolean") patch.paused = body.paused;
  if (body.mapMode === "live" || body.mapMode === "scenario") patch.mapMode = body.mapMode as SimulatorMapMode;
  if (body.scenarioDate !== undefined) patch.scenarioDate = body.scenarioDate;
  if (body.scenarioTime !== undefined) patch.scenarioTime = body.scenarioTime;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Provide paused and/or mapMode and/or scenario fields" });
  }
  setSimulatorState(patch);
  res.json(getSimulatorState());
}

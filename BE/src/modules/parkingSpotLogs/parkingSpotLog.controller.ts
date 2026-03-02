import { Request, Response } from "express";
import * as service from "./parkingSpotLog.service";

export async function list(req: Request, res: Response) {
  const parkingSpotId = (req.query.parkingSpotId as string) || null;
  const logs = await service.findAll({ parkingSpotId });
  res.json(logs);
}

export async function getById(req: Request, res: Response) {
  const log = await service.findById(req.params.id);
  if (!log) return res.status(404).json({ error: "Parking spot log not found" });
  res.json(log);
}


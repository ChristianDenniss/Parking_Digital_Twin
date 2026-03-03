import { Request, Response } from "express";
import * as parkingSpotService from "./parkingSpot.service";
import { createParkingSpotSchema, updateParkingSpotStatusSchema } from "./parkingSpot.schema";
import { validate } from "../../utils/validate";

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

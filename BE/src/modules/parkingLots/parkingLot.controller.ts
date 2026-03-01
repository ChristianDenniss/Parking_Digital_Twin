import { Request, Response } from "express";
import * as parkingLotService from "./parkingLot.service";
import { createParkingLotSchema } from "./parkingLot.schema";
import { validate } from "../../utils/validate";

export async function list(req: Request, res: Response) {
  const lots = await parkingLotService.findAll();
  res.json(lots);
}

export async function getById(req: Request, res: Response) {
  const lot = await parkingLotService.findById(req.params.id);
  if (!lot) return res.status(404).json({ error: "Parking lot not found" });
  res.json(lot);
}

export async function getSpots(req: Request, res: Response) {
  const spots = await parkingLotService.findSpotsByParkingLotId(req.params.id);
  res.json(spots);
}

export async function create(req: Request, res: Response) {
  const result = validate(createParkingLotSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const lot = await parkingLotService.create(result.data!);
  res.status(201).json(lot);
}

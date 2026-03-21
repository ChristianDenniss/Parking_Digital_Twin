import { Request, Response } from "express";
import * as lotBuildingDistanceService from "./lotBuildingDistance.service";

export async function list(req: Request, res: Response) {
  const parkingLotId = (req.query.parkingLotId as string) || null;
  const buildingId = (req.query.buildingId as string) || null;
  if (parkingLotId?.trim() && buildingId?.trim()) {
    const one = await lotBuildingDistanceService.findByLotAndBuilding(
      parkingLotId.trim(),
      buildingId.trim()
    );
    if (!one) return res.status(404).json({ error: "Lot-building distance not found" });
    return res.json(one);
  }
  const rows = await lotBuildingDistanceService.findAll({
    parkingLotId: parkingLotId?.trim() || null,
    buildingId: buildingId?.trim() || null,
  });
  res.json(rows);
}

export async function create(req: Request, res: Response) {
  const { parkingLotId, buildingId, distanceMeters } = req.body as {
    parkingLotId?: string;
    buildingId?: string;
    distanceMeters?: number;
  };
  if (!parkingLotId?.trim() || !buildingId?.trim()) {
    return res.status(400).json({ error: "parkingLotId and buildingId are required" });
  }
  const num = Number(distanceMeters);
  if (Number.isNaN(num) || num < 0) {
    return res.status(400).json({ error: "distanceMeters must be a non-negative number" });
  }
  const existing = await lotBuildingDistanceService.findByLotAndBuilding(
    parkingLotId.trim(),
    buildingId.trim()
  );
  if (existing) {
    return res.status(409).json({ error: "Distance for this lot and building already exists" });
  }
  const row = await lotBuildingDistanceService.create({
    parkingLotId: parkingLotId.trim(),
    buildingId: buildingId.trim(),
    distanceMeters: num,
  });
  res.status(201).json(row);
}

export async function update(req: Request, res: Response) {
  const parkingLotId = (req.query.parkingLotId as string)?.trim();
  const buildingId = (req.query.buildingId as string)?.trim();
  if (!parkingLotId || !buildingId) {
    return res.status(400).json({ error: "parkingLotId and buildingId query params are required" });
  }
  const { distanceMeters } = req.body as { distanceMeters?: number };
  const num = Number(distanceMeters);
  if (Number.isNaN(num) || num < 0) {
    return res.status(400).json({ error: "distanceMeters must be a non-negative number" });
  }
  const row = await lotBuildingDistanceService.update(parkingLotId, buildingId, {
    distanceMeters: num,
  });
  if (!row) return res.status(404).json({ error: "Lot-building distance not found" });
  res.json(row);
}

export async function remove(req: Request, res: Response) {
  const parkingLotId = (req.query.parkingLotId as string)?.trim();
  const buildingId = (req.query.buildingId as string)?.trim();
  if (!parkingLotId || !buildingId) {
    return res.status(400).json({ error: "parkingLotId and buildingId query params are required" });
  }
  const row = await lotBuildingDistanceService.remove(parkingLotId, buildingId);
  if (!row) return res.status(404).json({ error: "Lot-building distance not found" });
  res.status(204).send();
}

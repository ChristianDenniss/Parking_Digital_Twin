import { Request, Response } from "express";
import * as parkingLotService from "./parkingLot.service";
import { createParkingLotSchema, recommendParkingSchema } from "./parkingLot.schema";
import { validate } from "../../utils/validate";

export async function list(req: Request, res: Response) {
  const buildingId = req.query.buildingId as string | undefined;
  if (buildingId?.trim()) {
    const recommendations = await parkingLotService.findRecommendationsByBuilding(buildingId.trim());
    res.json(
      recommendations.map((r) => ({
        ...r.lot,
        distanceMeters: r.distanceMeters,
        freeSpots: r.freeSpots,
        occupancyPercent: r.occupancyPercent,
      }))
    );
    return;
  }
  const lots = await parkingLotService.findAll();
  res.json(lots);
}

export async function getById(req: Request, res: Response) {
  const lot = await parkingLotService.findById(req.params.id);
  if (!lot) return res.status(404).json({ error: "Parking lot not found" });
  res.json(lot);
}

export async function getSpots(req: Request, res: Response) {
  const section = (req.query.section as string) || null;
  const spots = await parkingLotService.findSpotsByParkingLotId(req.params.id, section);
  res.json(spots);
}

export async function create(req: Request, res: Response) {
  const result = validate(createParkingLotSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const lot = await parkingLotService.create(result.data!);
  res.status(201).json(lot);
}

export async function recommend(req: Request, res: Response) {
  const result = validate(recommendParkingSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });

  const data = result.data!;
  const recommendation = await parkingLotService.recommendBestParking({
    ...data,
    stateMode: data.stateMode ?? "current",
  });
  if (!recommendation) {
    return res.status(404).json({
      error: "No parking recommendation available for this building and state.",
    });
  }

  return res.json({
    lot: recommendation.lot,
    spot: recommendation.spot,
    distanceMeters: recommendation.distanceMeters,
    freeSpotsInSelectedLot: recommendation.freeSpotsInSelectedLot,
    evaluatedMode: recommendation.evaluatedMode,
  });
}

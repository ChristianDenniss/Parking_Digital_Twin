import { Request, Response } from "express";
import * as parkingLotService from "./parkingLot.service";
import * as parkingOccupancyAssign from "../parkingSpots/parkingOccupancyAssign.service";
import { createParkingLotSchema, recommendParkingSchema } from "./parkingLot.schema";
import { validate } from "../../utils/validate";
import type { AuthUser } from "../../middleware/auth";
import { DEFAULT_ANONYMOUS_PARKING_ELIGIBILITY } from "./parkingLotEligibility";

export async function forecast(req: Request, res: Response) {
  const date = typeof req.query.date === "string" ? req.query.date : "";
  const time = typeof req.query.time === "string" ? req.query.time : "";
  try {
    const summary = await parkingOccupancyAssign.getParkingForecastForRequest(date, time);
    res.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "forecast failed";
    res.status(400).json({ error: msg });
  }
}

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
  const authUser = (req as Request & { user?: AuthUser }).user;
  const parkingEligibility = authUser
    ? { role: authUser.role, resident: authUser.resident, disabled: authUser.disabled }
    : DEFAULT_ANONYMOUS_PARKING_ELIGIBILITY;

  const recommendation = await parkingLotService.recommendBestParking({
    buildingId: data.buildingId,
    stateMode: data.stateMode ?? "current",
    parkingEligibility,
    predictedFreeSpotsByLotId: data.predictedFreeSpotsByLotId,
    predictedSpotStatusByLotId: data.predictedSpotStatusByLotId,
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
    occupancyPercent: recommendation.occupancyPercent,
    evaluatedMode: recommendation.evaluatedMode,
  });
}

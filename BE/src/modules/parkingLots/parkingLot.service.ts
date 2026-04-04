import { AppDataSource } from "../../db/data-source";
import { ParkingLot } from "./parkingLot.entity";
import { ParkingSpot } from "../parkingSpots/parkingSpot.entity";
import * as lotBuildingDistanceService from "../buildings/lotBuildingDistance.service";
import type { UserParkingEligibility } from "./parkingLotEligibility";
import { isUserEligibleForLot } from "./parkingLotEligibility";

const repo = () => AppDataSource.getRepository(ParkingLot);
const spotRepo = () => AppDataSource.getRepository(ParkingSpot);

export async function findAll(): Promise<ParkingLot[]> {
  return repo().find({ order: { createdAt: "ASC" } });
}

export async function findById(id: string): Promise<ParkingLot | null> {
  return repo().findOne({ where: { id } });
}

export async function findSpotsByParkingLotId(
  parkingLotId: string,
  section?: string | null
) {
  const where: { parkingLotId: string; section?: string } = { parkingLotId };
  if (section != null && section !== "") where.section = section;
  return spotRepo().find({
    where,
    order: { slotIndex: "ASC", section: "ASC", row: "ASC", index: "ASC" },
  });
}

export async function create(data: { name: string; capacity: number; campus?: string; imageUrl?: string | null }): Promise<ParkingLot> {
  const lot = repo().create({
    name: data.name,
    capacity: data.capacity,
    campus: data.campus ?? "UNB Saint John",
    imageUrl: data.imageUrl ?? null,
  });
  return repo().save(lot);
}

export async function update(
  id: string,
  data: Partial<{ name: string; capacity: number; campus: string; imageUrl: string | null }>
): Promise<ParkingLot | null> {
  const lot = await repo().findOne({ where: { id } });
  if (!lot) return null;
  Object.assign(lot, data);
  return repo().save(lot);
}

/** Lots with distance to a building and occupancy, for "where to park" optimization. Sorted by distance then by free spots (desc). */
export async function findRecommendationsByBuilding(buildingId: string): Promise<
  Array<{
    lot: ParkingLot;
    distanceMeters: number;
    freeSpots: number;
    capacity: number;
    occupancyPercent: number;
  }>
> {
  const distances = await lotBuildingDistanceService.findAll({ buildingId });
  const results = await Promise.all(
    distances.map(async (d) => {
      const lot = d.parkingLot ?? (await findById(d.parkingLotId));
      if (!lot) return null;
      const spots = await spotRepo().find({ where: { parkingLotId: lot.id } });
      const freeSpots = spots.filter((s) => s.currentStatus === "empty").length;
      const capacity = lot.capacity;
      const occupancyPercent = capacity > 0 ? Math.round((1 - freeSpots / capacity) * 100) : 0;
      return {
        lot,
        distanceMeters: d.distanceMeters,
        freeSpots,
        capacity,
        occupancyPercent,
      };
    })
  );
  const valid = results.filter((r): r is NonNullable<typeof r> => r != null);
  valid.sort((a, b) => {
    if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
    return b.freeSpots - a.freeSpots;
  });
  return valid;
}

type SpotStatus = "occupied" | "empty";

export async function recommendBestParking(params: {
  buildingId: string;
  stateMode: "current" | "predicted";
  parkingEligibility?: UserParkingEligibility;
  predictedFreeSpotsByLotId?: Record<string, number>;
  predictedSpotStatusByLotId?: Record<string, Record<string, SpotStatus>>;
}): Promise<{
  lot: ParkingLot;
  spot: ParkingSpot;
  distanceMeters: number;
  freeSpotsInSelectedLot: number;
  occupancyPercent: number;
  evaluatedMode: "current" | "predicted";
} | null> {
  const rankedLots = await findRecommendationsByBuilding(params.buildingId);
  if (rankedLots.length === 0) return null;

  const eligibility = params.parkingEligibility;
  const eligibleRanked =
    eligibility != null
      ? rankedLots.filter((r) => isUserEligibleForLot(r.lot.name, eligibility))
      : rankedLots;

  for (const ranked of eligibleRanked) {
    const lotId = ranked.lot.id;
    const spots = await spotRepo().find({
      where: { parkingLotId: lotId },
      order: { slotIndex: "ASC", section: "ASC", row: "ASC", index: "ASC" },
    });
    if (spots.length === 0) continue;

    const predictedSpotStatuses = params.predictedSpotStatusByLotId?.[lotId];
    const predictedLotFreeSpots = params.predictedFreeSpotsByLotId?.[lotId];

    const isSpotEmpty = (spot: ParkingSpot): boolean => {
      if (params.stateMode === "predicted" && predictedSpotStatuses?.[spot.id] != null) {
        return predictedSpotStatuses[spot.id] === "empty";
      }
      return spot.currentStatus === "empty";
    };

    const candidateSpot = spots.find((s) => isSpotEmpty(s));
    if (!candidateSpot) continue;

    const computedFreeSpots = spots.reduce((count, s) => count + (isSpotEmpty(s) ? 1 : 0), 0);
    const freeSpotsInSelectedLot =
      params.stateMode === "predicted" && predictedLotFreeSpots != null
        ? predictedLotFreeSpots
        : computedFreeSpots;

    if (freeSpotsInSelectedLot <= 0) continue;

    const capacity = ranked.lot.capacity;
    const occupancyPercent =
      capacity > 0
        ? Math.round((1 - freeSpotsInSelectedLot / capacity) * 100)
        : spots.length > 0
          ? Math.round(
              (spots.reduce((n, s) => n + (isSpotEmpty(s) ? 0 : 1), 0) / spots.length) * 100
            )
          : 0;

    return {
      lot: ranked.lot,
      spot: candidateSpot,
      distanceMeters: ranked.distanceMeters,
      freeSpotsInSelectedLot,
      occupancyPercent,
      evaluatedMode: params.stateMode,
    };
  }

  return null;
}

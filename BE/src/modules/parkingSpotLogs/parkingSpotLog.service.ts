import { AppDataSource } from "../../db/data-source";
import { ParkingSpotLog } from "./parkingSpotLog.entity";

const repo = () => AppDataSource.getRepository(ParkingSpotLog);

export async function findAll(filters: { parkingSpotId?: string | null } = {}): Promise<ParkingSpotLog[]> {
  const where: { parkingSpotId?: string } = {};
  if (filters.parkingSpotId) where.parkingSpotId = filters.parkingSpotId;

  return repo().find({
    where: Object.keys(where).length ? where : undefined,
    order: { recordedAt: "DESC" },
  });
}

export async function findById(id: string): Promise<ParkingSpotLog | null> {
  return repo().findOne({ where: { id } });
}


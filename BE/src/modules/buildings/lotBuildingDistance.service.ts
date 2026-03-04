import { AppDataSource } from "../../db/data-source";
import { LotBuildingDistance } from "./lotBuildingDistance.entity";

const repo = () => AppDataSource.getRepository(LotBuildingDistance);

export async function findAll(filters: {
  parkingLotId?: string | null;
  buildingId?: string | null;
} = {}): Promise<LotBuildingDistance[]> {
  const where: { parkingLotId?: string; buildingId?: string } = {};
  if (filters.parkingLotId) where.parkingLotId = filters.parkingLotId;
  if (filters.buildingId) where.buildingId = filters.buildingId;
  return repo().find({
    where: Object.keys(where).length ? where : undefined,
    relations: ["parkingLot", "building"],
    order: { distanceMeters: "ASC" },
  });
}

export async function findByLotAndBuilding(
  parkingLotId: string,
  buildingId: string
): Promise<LotBuildingDistance | null> {
  return repo().findOne({
    where: { parkingLotId, buildingId },
    relations: ["parkingLot", "building"],
  });
}

export async function create(data: {
  parkingLotId: string;
  buildingId: string;
  distanceMeters: number;
}): Promise<LotBuildingDistance> {
  const d = repo().create(data);
  return repo().save(d);
}

export async function update(
  parkingLotId: string,
  buildingId: string,
  data: { distanceMeters: number }
): Promise<LotBuildingDistance | null> {
  const d = await repo().findOne({ where: { parkingLotId, buildingId } });
  if (!d) return null;
  d.distanceMeters = data.distanceMeters;
  return repo().save(d);
}

export async function remove(
  parkingLotId: string,
  buildingId: string
): Promise<LotBuildingDistance | null> {
  const d = await repo().findOne({ where: { parkingLotId, buildingId } });
  if (!d) return null;
  await repo().remove(d);
  return d;
}

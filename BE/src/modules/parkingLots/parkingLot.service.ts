import { AppDataSource } from "../../db/data-source";
import { ParkingLot } from "./parkingLot.entity";
import { ParkingSpot } from "../parkingSpots/parkingSpot.entity";

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
    order: { section: "ASC", row: "ASC", index: "ASC" },
  });
}

export async function create(data: { name: string; capacity: number; campus?: string }): Promise<ParkingLot> {
  const lot = repo().create({
    name: data.name,
    capacity: data.capacity,
    campus: data.campus ?? "UNB Saint John",
  });
  return repo().save(lot);
}

export async function update(id: string, data: Partial<{ name: string; capacity: number; campus: string }>): Promise<ParkingLot | null> {
  const lot = await repo().findOne({ where: { id } });
  if (!lot) return null;
  Object.assign(lot, data);
  return repo().save(lot);
}

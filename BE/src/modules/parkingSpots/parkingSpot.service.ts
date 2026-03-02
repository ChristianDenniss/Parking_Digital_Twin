import { AppDataSource } from "../../db/data-source";
import { ParkingSpot } from "./parkingSpot.entity";
import { ParkingSpotLog } from "../parkingSpotLogs/parkingSpotLog.entity";

const spotRepo = () => AppDataSource.getRepository(ParkingSpot);
const logRepo = () => AppDataSource.getRepository(ParkingSpotLog);

export async function findAll(parkingLotId: string | null = null): Promise<ParkingSpot[]> {
  const opts = parkingLotId
    ? { where: { parkingLotId }, order: { row: "ASC" as const, index: "ASC" as const } }
    : { order: { parkingLotId: "ASC" as const, row: "ASC" as const, index: "ASC" as const } };
  return spotRepo().find(opts);
}

export async function findById(id: string): Promise<ParkingSpot | null> {
  return spotRepo().findOne({ where: { id } });
}

export async function updateStatus(id: string, status: "occupied" | "empty"): Promise<ParkingSpot | null> {
  const spot = await spotRepo().findOne({ where: { id } });
  if (!spot) return null;
  spot.currentStatus = status;
  await spotRepo().save(spot);
  const log = logRepo().create({
    parkingSpotId: spot.id,
    status,
    recordedAt: new Date(),
  });
  await logRepo().save(log);
  return spot;
}

export async function create(data: {
  parkingLotId: string;
  label: string;
  row?: string;
  index?: number;
}): Promise<ParkingSpot> {
  const spot = spotRepo().create({
    parkingLotId: data.parkingLotId,
    label: data.label,
    row: data.row ?? "",
    index: data.index ?? 0,
    currentStatus: "empty",
  });
  return spotRepo().save(spot);
}

export async function update(
  id: string,
  data: Partial<{ label: string; row: string; index: number }>
): Promise<ParkingSpot | null> {
  const spot = await spotRepo().findOne({ where: { id } });
  if (!spot) return null;
  Object.assign(spot, data);
  return spotRepo().save(spot);
}

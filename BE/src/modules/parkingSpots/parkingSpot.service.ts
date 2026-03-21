import { AppDataSource } from "../../db/data-source";
import { ParkingSpot } from "./parkingSpot.entity";
import { ParkingSpotLog } from "../parkingSpotLogs/parkingSpotLog.entity";

const spotRepo = () => AppDataSource.getRepository(ParkingSpot);
const logRepo = () => AppDataSource.getRepository(ParkingSpotLog);

export async function findAll(filters: {
  parkingLotId?: string | null;
  section?: string | null;
} = {}): Promise<ParkingSpot[]> {
  const where: { parkingLotId?: string; section?: string } = {};
  if (filters.parkingLotId) where.parkingLotId = filters.parkingLotId;
  if (filters.section != null && filters.section !== "") where.section = filters.section;

  return spotRepo().find({
    where: Object.keys(where).length ? where : undefined,
    order: {
      parkingLotId: "ASC",
      section: "ASC",
      row: "ASC",
      index: "ASC",
    },
  });
}

export async function findById(id: string): Promise<ParkingSpot | null> {
  return spotRepo().findOne({ where: { id } });
}

/**
 * Update spot status (taken/freed). Every status change automatically creates
 * a row in the parking_spot_readings (logs) table; no separate call needed.
 */
export async function updateStatus(id: string, status: "occupied" | "empty"): Promise<ParkingSpot | null> {
  const spot = await spotRepo().findOne({ where: { id } });
  if (!spot) return null;
  spot.currentStatus = status;
  await spotRepo().save(spot);
  // Log is created in the same flow; API and simulator never call log APIs directly
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
  section?: string;
  row?: string;
  index?: number;
}): Promise<ParkingSpot> {
  const spot = spotRepo().create({
    parkingLotId: data.parkingLotId,
    label: data.label,
    section: data.section ?? "",
    row: data.row ?? "",
    index: data.index ?? 0,
    currentStatus: "empty",
  });
  return spotRepo().save(spot);
}

export async function update(
  id: string,
  data: Partial<{ label: string; section: string; row: string; index: number }>
): Promise<ParkingSpot | null> {
  const spot = await spotRepo().findOne({ where: { id } });
  if (!spot) return null;
  Object.assign(spot, data);
  return spotRepo().save(spot);
}

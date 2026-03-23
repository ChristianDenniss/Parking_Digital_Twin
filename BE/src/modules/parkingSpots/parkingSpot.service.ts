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

export async function findAllWithLots(): Promise<ParkingSpot[]> {
  return spotRepo().find({
    relations: ["parkingLot"],
    order: {
      parkingLotId: "ASC",
      slotIndex: "ASC",
      section: "ASC",
      row: "ASC",
      index: "ASC",
      id: "ASC",
    },
  });
}

/** Simulator / bulk scenario: no per-spot log rows. */
export async function updateStatusWithoutLog(id: string, status: "occupied" | "empty"): Promise<void> {
  await spotRepo().update({ id }, { currentStatus: status });
}

/**
 * Record a reading in `parking_spot_readings` without touching `parking_spots` again.
 * Used by the simulator after `updateStatusWithoutLog` so the Logs UI stays in sync with live flips.
 */
export async function appendStatusReadingLog(parkingSpotId: string, status: "occupied" | "empty"): Promise<void> {
  const log = logRepo().create({
    parkingSpotId,
    status,
    recordedAt: new Date(),
  });
  await logRepo().save(log);
}

export async function bulkSetStatusesWithoutLogs(
  updates: { id: string; status: "occupied" | "empty" }[]
): Promise<void> {
  if (updates.length === 0) return;
  const CHUNK = 80;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    await Promise.all(slice.map((u) => spotRepo().update({ id: u.id }, { currentStatus: u.status })));
  }
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
  // Log is created in the same flow (simulator uses updateStatusWithoutLog + appendStatusReadingLog instead)
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

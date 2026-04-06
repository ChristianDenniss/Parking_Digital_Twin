/**
 * Populates distanceFromExit and isAccessible on every parking spot.
 *
 * Rules:
 *  - Spots are ordered by slotIndex ASC within each lot.
 *  - distanceFromExit: linear 5 m → 60 m across the lot's spots (front = easiest egress).
 *  - isAccessible: first 2 spots per lot (up to 1 for lots with fewer than 20 spots).
 *
 * Safe to re-run: updates every spot on each run.
 *
 * Usage:  npx ts-node --transpile-only scripts/populateSpotAttributes.ts
 */
import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import { ParkingLot } from "../src/modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../src/modules/parkingSpots/parkingSpot.entity";

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const spotRepo = AppDataSource.getRepository(ParkingSpot);

  const lots = await lotRepo.find();
  let totalUpdated = 0;

  for (const lot of lots) {
    const spots = await spotRepo.find({
      where: { parkingLotId: lot.id },
      order: { slotIndex: "ASC", section: "ASC", row: "ASC", index: "ASC" },
    });

    if (spots.length === 0) continue;

    const n = spots.length;
    const accessibleCount = n < 20 ? 1 : 2;

    const updates: ParkingSpot[] = spots.map((spot, rank) => {
      // Linear interpolation: first spot = 5 m, last spot = 60 m
      spot.distanceFromExit = Math.round(5 + (rank / Math.max(n - 1, 1)) * 55);
      spot.isAccessible = rank < accessibleCount;
      return spot;
    });

    await spotRepo.save(updates);
    totalUpdated += updates.length;
    console.log(`  ${lot.name}: ${n} spots updated (${accessibleCount} accessible)`);
  }

  console.log(`\nDone. ${totalUpdated} spots updated across ${lots.length} lots.`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

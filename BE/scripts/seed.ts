import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import { ParkingLot } from "../src/modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../src/modules/parkingSpots/parkingSpot.entity";

async function seed() {
  await AppDataSource.initialize();
  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const spotRepo = AppDataSource.getRepository(ParkingSpot);

  const existing = await lotRepo.count();
  if (existing > 0) {
    console.log("DB already has data. Skipping seed.");
    await AppDataSource.destroy();
    process.exit(0);
  }

  const lot = lotRepo.create({
    name: "Tilley Hall Lot",
    campus: "UNB Saint John",
    capacity: 24,
  });
  await lotRepo.save(lot);

  const rows = ["A", "B", "C"];
  for (let r = 0; r < rows.length; r++) {
    for (let i = 1; i <= 8; i++) {
      const spot = spotRepo.create({
        parkingLotId: lot.id,
        label: `${rows[r]}-${String(i).padStart(2, "0")}`,
        row: rows[r],
        index: i,
        currentStatus: Math.random() < 0.5 ? "occupied" : "empty",
      });
      await spotRepo.save(spot);
    }
  }

  console.log("Seeded 1 parking lot and 24 parking spots.");
  await AppDataSource.destroy();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

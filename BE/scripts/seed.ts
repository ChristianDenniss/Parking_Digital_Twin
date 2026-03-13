import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import { ParkingLot } from "../src/modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../src/modules/parkingSpots/parkingSpot.entity";
import { Building } from "../src/modules/buildings/building.entity";
import { LotBuildingDistance } from "../src/modules/buildings/lotBuildingDistance.entity";

/** Image URLs to randomly assign to lots if image assign fails frontend display testing. */
const LOT_IMAGE_URLS = [
  "https://i.postimg.cc/pX9kY0b9/Parking-Lot-Place-Holder3.jpg",
  "https://i.postimg.cc/5NHpqPdF/Parking-Lot-Place-Holder2.jpg",
  "https://i.postimg.cc/MKctbs2K/Parking-Lot-Place-Holder1.jpg",
] as const;

function randomLotImageUrl(): string {
  return LOT_IMAGE_URLS[Math.floor(Math.random() * LOT_IMAGE_URLS.length)];
}

const REPLACE = process.argv.includes("--replace");

async function seed() {
  await AppDataSource.initialize();
  const lotRepo = AppDataSource.getRepository(ParkingLot);
  const spotRepo = AppDataSource.getRepository(ParkingSpot);

  const spotCount = await spotRepo.count();
  const lotCount = await lotRepo.count();
  if (REPLACE || spotCount > 0 || lotCount > 0) {
    if (REPLACE) {
      console.log("Replace mode: clearing parking lots and spots only (courses, students, users, buildings are left intact).");
    } else {
      console.log(`Clearing existing data (${spotCount} spots) to re-seed to match current lotsConfig capacities...`);
    }
    // Only parking data; do not delete courses, class_schedule, students, users, or buildings.
    await spotRepo.createQueryBuilder().delete().execute();
    await lotRepo.createQueryBuilder().delete().execute();
  }

  // 16 lots (names match GEE features); capacities define campus total spaces
  const lotsConfig = [
    { name: "StaffParking1", capacity: 145 },
    { name: "GeneralParking1", capacity: 119 },
    { name: "GeneralParking2", capacity: 200 }, // X (estimated)
    { name: "GeneralParking3", capacity: 200 }, // X (estimated)
    { name: "TimedParking1", capacity: 17 },
    { name: "GeneralParking4", capacity: 200 }, // X (estimated)
    { name: "TimedParking2", capacity: 27 },
    { name: "StaffParking2", capacity: 6 },
    { name: "ResidentParking1", capacity: 20 },
    { name: "ResidentParking2", capacity: 21 },
    { name: "StaffParking3", capacity: 17 },
    { name: "TBD", capacity: 44 },
    { name: "PHDParking1", capacity: 17 },
    { name: "GeneralParking5", capacity: 24 },
    { name: "StaffParking4", capacity: 10 },
    { name: "ResidentParking3", capacity: 22 },
  ] as const;

  const lots: ParkingLot[] = [];
  for (const cfg of lotsConfig) {
    const lot = lotRepo.create({
      name: cfg.name,
      campus: "UNB Saint John",
      capacity: cfg.capacity,
      imageUrl: randomLotImageUrl(),
    });
    await lotRepo.save(lot);
    lots.push(lot);
  }

  const BATCH = 200;
  const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  let totalSpots = 0;
  for (let lotIndex = 0; lotIndex < lots.length; lotIndex++) {
    const lot = lots[lotIndex];
    const capacity = lot.capacity;
    const perRow = Math.ceil(capacity / rows.length);
    // At least one lot in dark red (≥95% full), one in dark green (<40% full)
    let occupiedCount: number | null = null;
    if (lotIndex === 0) {
      occupiedCount = Math.ceil(capacity * 0.96); // ~96% → dark red
    } else if (lotIndex === 1) {
      occupiedCount = Math.floor(capacity * 0.35); // ~35% → dark green
    }
    const spots: ParkingSpot[] = [];
    for (let n = 0; n < capacity; n++) {
      const rowIndex = n % perRow;
      const rowLetter = rows[Math.floor(n / perRow)];
      const prefix = lot.name.slice(0, 2).toUpperCase().replace(/\s/g, "");
      const status: "occupied" | "empty" =
        occupiedCount !== null
          ? n < occupiedCount
            ? "occupied"
            : "empty"
          : Math.random() < 0.5
            ? "occupied"
            : "empty";
      spots.push(
        spotRepo.create({
          parkingLotId: lot.id,
          label: `${prefix}-${rowLetter}-${String(rowIndex + 1).padStart(3, "0")}`,
          section: rowLetter,
          row: rowLetter,
          index: rowIndex + 1,
          currentStatus: status,
        })
      );
    }
    for (let i = 0; i < spots.length; i += BATCH) {
      await spotRepo.save(spots.slice(i, i + BATCH));
    }
    totalSpots += spots.length;
  }

  // Buildings and lot–building distances (for "where to park" optimization)
  const buildingRepo = AppDataSource.getRepository(Building);
  const distanceRepo = AppDataSource.getRepository(LotBuildingDistance);
  let buildings: Building[] = [];
  if ((await buildingRepo.count()) === 0) {
    const buildingConfigs = [
      { name: "Ganong Hall", code: "Ganong Hall" },
      { name: "K.C. Irving Hall", code: "K.C. Irving Hall" },
      { name: "Hans W. Klohn Commons (library)", code: "Hans W. Klohn Commons (library)" },
      { name: "Thomas J. Condon Student Centre", code: "Thomas J. Condon Student Centre" },
      { name: "G. Forbes Elliot Athletics Centre", code: "G. Forbes Elliot Athletics Centre" },
      { name: "Sir Douglas Hazen Hall", code: "Sir Douglas Hazen Hall" },
      { name: "Philip W. Oland Hall", code: "Philip W. Oland Hall" },
      { name: "Sir James Dunn Residence", code: "Sir James Dunn Residence" },
      { name: "Colin B. Mackay Residence", code: "Colin B. Mackay Residence" },
      { name: "Barry & Flora Beckett Residence", code: "Barry & Flora Beckett Residence" },
      { name: "Canada Games Stadium", code: "Canada Games Stadium" },
      { name: "Dalhousie Medicine New Brunswick building", code: "Dalhousie Medicine New Brunswick building" },
    ];
    for (const cfg of buildingConfigs) {
      const b = buildingRepo.create({ name: cfg.name, code: cfg.code });
      await buildingRepo.save(b);
      buildings.push(b);
    }
    console.log(`Seeded ${buildings.length} buildings.`);
  } else {
    buildings = await buildingRepo.find({ order: { name: "ASC" } });
  }
  if ((await distanceRepo.count()) === 0 && buildings.length > 0) {
    for (const lot of lots) {
      for (const building of buildings) {
        const distanceMeters = 50 + Math.floor(Math.random() * 450);
        const d = distanceRepo.create({
          parkingLotId: lot.id,
          buildingId: building.id,
          distanceMeters,
        });
        await distanceRepo.save(d);
      }
    }
    console.log(`Seeded lot–building distances (${lots.length} lots × ${buildings.length} buildings).`);
  }

  console.log(`Seeded ${lots.length} parking lots and ${totalSpots} parking spots.`);
  await AppDataSource.destroy();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

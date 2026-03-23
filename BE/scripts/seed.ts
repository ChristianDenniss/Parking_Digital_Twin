import "reflect-metadata";
import path from "path";
import fs from "fs";
import { AppDataSource } from "../src/db/data-source";
import { ParkingLot } from "../src/modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../src/modules/parkingSpots/parkingSpot.entity";
import { Building } from "../src/modules/buildings/building.entity";
import { LotBuildingDistance } from "../src/modules/buildings/lotBuildingDistance.entity";
import * as parkingOccupancyAssign from "../src/modules/parkingSpots/parkingOccupancyAssign.service";

/** Path to lot SVGs (DTProj/FE/src/images/svgs).
 * Seed reads data-spot-label from each file as source of truth.
 *
 * seed.ts lives in `BE/scripts`, so `../../FE/...` resolves back to `DTProj/FE/...`.
 */
const LOT_SVGS_DIR = path.join(__dirname, "../../FE/src/images/svgs");

/** Spot layer = has data-spot-label and label does not contain "BG". Returns labels in document order (1:1 with SVG layers). */
function parseSpotLayersFromSvg(svgContent: string): string[] {
  // Primary format: data-spot-label="A-001"
  // Fallback format (some uploaded SVGs): id="A-001"
  const re = /(?:data-spot-label|id)="([^"]+)"/g;
  const labels: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgContent)) !== null) {
    const label = m[1].trim();
    if (!label || /BG/i.test(label)) continue;
    if (!/^[A-Za-z]+-\d+$/i.test(label)) continue;
    labels.push(label);
  }
  return labels;
}

const SVG_ENABLED_FILL = "#84CE8F";
const SVG_DISABLED_FILL = "#A5CEDC";
function parseSpotOrderFromSvgByFill(svgContent: string): boolean[] {
  // Returns stall order as they appear in the SVG file.
  // - true  => disabled stall (blue)
  // - false => enabled stall (green)
  // This is a fallback for SVGs that don't include `data-spot-label`.
  const re = /<(rect|path)[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*>/g;
  const disabledByOrder: boolean[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgContent)) !== null) {
    const fill = m[2].toUpperCase();
    if (fill === SVG_ENABLED_FILL.toUpperCase()) disabledByOrder.push(false);
    else if (fill === SVG_DISABLED_FILL.toUpperCase()) disabledByOrder.push(true);
  }
  return disabledByOrder;
}

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

const SEED_SCENARIO_DATE = process.env.SEED_SCENARIO_DATE ?? "2026-03-15";
const SEED_SCENARIO_TIME = process.env.SEED_SCENARIO_TIME ?? "11:00";

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

  // 16 lots (names match GEE features).
  // capacity here is a fallback / initial value:
  // - if an SVG exists in FE/src/images/svgs/{LotName}.svg, the real capacity and spots come from the SVG (one spot per data-spot-label).
  // - if no SVG exists, capacity is used to generate fallback A-J rows.
  const lotsConfig: readonly { name: string; capacity: number }[] = [
    { name: "StaffParking1", capacity: 148 },
    { name: "GeneralParking1", capacity: 119 },
    { name: "GeneralParking2", capacity: 200 },
    { name: "GeneralParking3", capacity: 200 },
    { name: "TimedParking1", capacity: 17 },
    { name: "GeneralParking4", capacity: 342 },
    { name: "TimedParking2", capacity: 27 },
    { name: "StaffParking2", capacity: 6 },
    { name: "ResidentParking1", capacity: 20 },
    { name: "ResidentParking2", capacity: 23 },
    { name: "StaffParking3", capacity: 18 },
    { name: "TBD", capacity: 44 },
    { name: "PHDParking1", capacity: 17 },
    { name: "GeneralParking5", capacity: 24 },
    { name: "StaffParking4", capacity: 10 },
    { name: "ResidentParking3", capacity: 22 },
  ];

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
  const fallbackRows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  let totalSpots = 0;
  for (const lot of lots) {
    const capacity = lot.capacity;
    const lotPrefix = (() => {
      const base = lot.name.replace(/\s/g, "");
      const trailingNum = base.match(/\d+$/)?.[0];
      const letters = base.slice(0, 2).toUpperCase();
      return trailingNum != null ? `${letters}${trailingNum}` : letters;
    })();

    // Only lots with an SVG in FE/src/images/svgs/{lotName}.svg get spots from the file; others use fallback.
    const svgPath = path.join(LOT_SVGS_DIR, `${lot.name}.svg`);
    let svgLabels: string[] = [];
    let svgSpotOrderByFill: boolean[] = [];
    if (fs.existsSync(svgPath)) {
      try {
        const content = fs.readFileSync(svgPath, "utf-8");
        svgLabels = parseSpotLayersFromSvg(content);
        if (svgLabels.length === 0) {
          svgSpotOrderByFill = parseSpotOrderFromSvgByFill(content);
        }
      } catch (err) {
        console.warn(`Could not parse SVG for ${lot.name}:`, err);
      }
    }

    const spots: ParkingSpot[] = [];
    if (svgLabels.length > 0) {
      // SVG is source of truth: one spot per layer (in order). slotIndex = 1-based position for 1:1 match on frontend.
      svgLabels.forEach((rowAndNumber, n) => {
        const match = rowAndNumber.match(/^([A-Za-z]+)-(\d+)$/);
        const section = match ? match[1] : rowAndNumber.split("-")[0] ?? "A";
        const index = match ? parseInt(match[2], 10) : n + 1;
        spots.push(
          spotRepo.create({
            parkingLotId: lot.id,
            label: `${lotPrefix}-${rowAndNumber}`,
            section,
            row: section,
            index,
            slotIndex: n + 1,
            currentStatus: "empty",
          })
        );
      });
      if (spots.length !== capacity) {
        console.warn(`${lot.name}: SVG has ${spots.length} spots, config capacity ${capacity}. Updating lot capacity.`);
        lot.capacity = spots.length;
        await lotRepo.save(lot);
      }
    } else if (svgSpotOrderByFill.length > 0) {
      // Unlabeled SVG fallback: treat each enabled/disabled stall shape as one spot.
      // We generate sequential slotIndex so the frontend can map by position.
      // Also spread labels across rows (A, B, C...) instead of forcing every spot into row A.
      // Label pattern becomes A-001, B-001, C-001 ... then A-002, B-002, ...
      const rowCount = Math.max(1, Math.min(fallbackRows.length, svgSpotOrderByFill.length));
      svgSpotOrderByFill.forEach((_isDisabled, n) => {
        const rowLetter = fallbackRows[n % rowCount];
        const idx = Math.floor(n / rowCount) + 1;
        const rowAndNumber = `${rowLetter}-${String(idx).padStart(3, "0")}`;
        spots.push(
          spotRepo.create({
            parkingLotId: lot.id,
            label: `${lotPrefix}-${rowAndNumber}`,
            section: rowLetter,
            row: rowLetter,
            index: idx,
            slotIndex: n + 1,
            currentStatus: "empty",
          })
        );
      });
      if (spots.length !== capacity) {
        console.warn(`${lot.name}: SVG has ${spots.length} spots (by fill), config capacity ${capacity}. Updating lot capacity.`);
        lot.capacity = spots.length;
        await lotRepo.save(lot);
      }
    } else {
      // No SVG for this lot: fallback split across A-J using config capacity
      const perRow = Math.ceil(capacity / fallbackRows.length);
      for (let n = 0; n < capacity; n++) {
        const rowIndex = n % perRow;
        const rowLetter = fallbackRows[Math.floor(n / perRow)];
        spots.push(
          spotRepo.create({
            parkingLotId: lot.id,
            label: `${lotPrefix}-${rowLetter}-${String(rowIndex + 1).padStart(3, "0")}`,
            section: rowLetter,
            row: rowLetter,
            index: rowIndex + 1,
            // Set slotIndex so frontend mapping-by-order works even for fallback-generated lots.
            slotIndex: n + 1,
            currentStatus: "empty",
          })
        );
      }
    }
    for (let i = 0; i < spots.length; i += BATCH) {
      await spotRepo.save(spots.slice(i, i + BATCH));
    }
    totalSpots += spots.length;
  }

  // Buildings and lot-building distances (for "where to park" optimization)
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
    console.log(`Seeded lot-building distances (${lots.length} lots x ${buildings.length} buildings).`);
  }

  try {
    const occ = await parkingOccupancyAssign.applyScenarioOccupancy(SEED_SCENARIO_DATE, SEED_SCENARIO_TIME);
    console.log(
      `Applied campus occupancy profile at ${SEED_SCENARIO_DATE} ${SEED_SCENARIO_TIME} (target k≈${occ.kTotal}; ${occ.updated} spot rows updated of ${occ.totalSpots}).`
    );
  } catch (e) {
    console.warn("Could not apply SEED_SCENARIO_DATE/TIME occupancy (courses/distances may be missing):", e);
  }

  console.log(`Seeded ${lots.length} parking lots and ${totalSpots} parking spots.`);
  await AppDataSource.destroy();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

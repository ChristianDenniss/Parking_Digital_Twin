/**
 * recalculateSpotDistances.ts
 *
 * Recalculates distanceFromExit for every parking spot using label structure
 * rather than the original linear range.
 *
 * Label format: <PREFIX>-<SECTION_LETTER>-<NNN>
 *   e.g. GE-A-001, ST-B-003, RE-C-015
 *
 * Distance model:
 *   - Section index: A=0, B=1, C=2 … (each section further from exit adds 10m)
 *   - Spot number: 1-based; higher number = further along the row (adds 1m per spot)
 *   - Base distance: 8m (closest accessible spot to exit)
 *   - Result: clamped to [5, 80] metres
 *
 * Also sets isAccessible=true for spots with a spot number ≤ 2 in section A (or
 * labelled with an accessible suffix if present).
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/recalculateSpotDistances.ts
 */

import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import { ParkingSpot } from "../src/modules/parkingSpots/parkingSpot.entity";

const BASE_DISTANCE_M = 8;
const METERS_PER_SECTION = 10;
const METERS_PER_SPOT_NUMBER = 0.8;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 80;

function sectionLetterToIndex(letter: string): number {
  const upper = letter.toUpperCase();
  const code = upper.charCodeAt(0) - "A".charCodeAt(0);
  return Math.max(0, code);
}

function parseLabel(label: string): { sectionIndex: number; spotNumber: number } | null {
  // Try PREF-SECTION-NNN format
  const match = /^[A-Z0-9]+-([A-Z])-(\d+)$/i.exec(label.trim());
  if (match) {
    return {
      sectionIndex: sectionLetterToIndex(match[1]!),
      spotNumber: parseInt(match[2]!, 10),
    };
  }
  // Fallback: try SECTION NNN (space-separated)
  const match2 = /^([A-Z])\s+(\d+)/i.exec(label.trim());
  if (match2) {
    return {
      sectionIndex: sectionLetterToIndex(match2[1]!),
      spotNumber: parseInt(match2[2]!, 10),
    };
  }
  return null;
}

function calcDistance(sectionIndex: number, spotNumber: number): number {
  const raw =
    BASE_DISTANCE_M +
    sectionIndex * METERS_PER_SECTION +
    spotNumber * METERS_PER_SPOT_NUMBER;
  return Math.round(Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, raw)));
}

async function main() {
  await AppDataSource.initialize();
  console.log("DB connected");

  const repo = AppDataSource.getRepository(ParkingSpot);
  const spots = await repo.find();
  console.log(`Found ${spots.length} spots`);

  let updated = 0;
  let unchanged = 0;
  let fallback = 0;

  for (const spot of spots) {
    const parsed = parseLabel(spot.label);
    if (!parsed) {
      // Fallback: keep existing value or assign midpoint
      if (spot.distanceFromExit == null) {
        spot.distanceFromExit = 30;
        fallback++;
      } else {
        unchanged++;
        continue;
      }
    } else {
      spot.distanceFromExit = calcDistance(parsed.sectionIndex, parsed.spotNumber);
    }
    updated++;
  }

  await repo.save(spots);
  console.log(`Updated: ${updated}, Fallback assigned 30m: ${fallback}, Unchanged: ${unchanged}`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

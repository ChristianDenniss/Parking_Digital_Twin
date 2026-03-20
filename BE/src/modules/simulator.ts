import * as parkingSpotService from "./parkingSpots/parkingSpot.service";
import { invalidateCache } from "../middleware/cache";

const INTERVAL_MS = 5_000;
const DEFAULT_OCCUPANCY_AVG = 0.6;
/** Fraction of spots to consider flipping per tick (0.5% = a few cars for ~1200 spots). */
const FLIP_FRACTION = 0.005;
/** Max spots to flip per tick so large lots don't churn too much. */
const MAX_FLIPS_PER_TICK = 8;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function runTick() {
  const spots = await parkingSpotService.findAll({});
  if (spots.length === 0) return;
  const occupancyTarget =
    process.env.SIM_OCCUPANCY != null ? Number(process.env.SIM_OCCUPANCY) : DEFAULT_OCCUPANCY_AVG;
  const toFlip = Math.min(MAX_FLIPS_PER_TICK, Math.max(1, Math.floor(spots.length * FLIP_FRACTION)));
  let didUpdate = false;
  for (let i = 0; i < toFlip; i++) {
    const spot = pickRandom(spots);
    const nextStatus: "occupied" | "empty" = Math.random() < occupancyTarget ? "occupied" : "empty";
    if (spot.currentStatus === nextStatus) continue;
    await parkingSpotService.updateStatus(spot.id, nextStatus);
    didUpdate = true;
  }

  // Simulator updates spots directly (not via PATCH routes), so we must clear cached
  // spot-lists for the UI to reflect changes without user interaction.
  if (didUpdate) {
    await invalidateCache("parking-lot-spots");
    await invalidateCache("parking-spots");
  }
}

export function startSimulator() {
  setInterval(() => runTick().catch(console.error), INTERVAL_MS);
  console.log("Simulator started: updating parking spot statuses every", INTERVAL_MS / 1000, "s");
}

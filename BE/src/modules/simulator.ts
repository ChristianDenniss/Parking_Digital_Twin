import * as parkingSpotService from "./parkingSpots/parkingSpot.service";

const INTERVAL_MS = 30_000;
const DEFAULT_OCCUPANCY_AVG = 0.6;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function runTick() {
  const spots = await parkingSpotService.findAll({});
  if (spots.length === 0) return;
  const occupancyTarget =
    process.env.SIM_OCCUPANCY != null ? Number(process.env.SIM_OCCUPANCY) : DEFAULT_OCCUPANCY_AVG;
  const toFlip = Math.max(1, Math.floor(spots.length * 0.05));
  for (let i = 0; i < toFlip; i++) {
    const spot = pickRandom(spots);
    const nextStatus: "occupied" | "empty" = Math.random() < occupancyTarget ? "occupied" : "empty";
    if (spot.currentStatus === nextStatus) continue;
    await parkingSpotService.updateStatus(spot.id, nextStatus);
  }
}

export function startSimulator() {
  setInterval(() => runTick().catch(console.error), INTERVAL_MS);
  console.log("Simulator started: updating parking spot statuses every", INTERVAL_MS / 1000, "s");
}

import * as parkingSpotService from "./parkingSpots/parkingSpot.service";
import { invalidateCache } from "../middleware/cache";
import { campusOccupancyInstantForMoncton } from "../utils/occupancySignal";
import {
  churnFromTriple,
  classTransitionChurnMultiplier,
  getMonctonNow,
  parseScenarioMoncton,
  targetOccupancyRatio,
  UNBSJ_TIMEZONE,
} from "../utils/campusOccupancyProfile";
import { DateTime } from "luxon";

const INTERVAL_MS = 5_000;
/** Base share of stalls considered per tick (scaled by profile churn); kept moderate so peaks don’t race to 100%. */
const FLIP_FRACTION = 0.00135;

/** Moncton local hours [0,24): treat as quiet campus (residual / night-shift cars only, little churn). */
function isQuietCampusHour(hour: number): boolean {
  return hour >= 22 || hour < 7;
}

function minOccupiedSpotsFloor(totalSpots: number): number {
  const raw = process.env.SIM_MIN_OCCUPIED_SPOTS != null ? Number(process.env.SIM_MIN_OCCUPIED_SPOTS) : 12;
  const n = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 12;
  return Math.min(totalSpots, Math.max(0, n));
}

export type SimulatorMapMode = "live" | "scenario";

let paused = process.env.SIMULATOR_START_PAUSED === "1";
let mapMode: SimulatorMapMode = "live";
let scenarioDateYmd: string | null = null;
let scenarioTimeHm: string | null = null;

export function getSimulatorState(): {
  paused: boolean;
  mapMode: SimulatorMapMode;
  scenarioDate: string | null;
  scenarioTime: string | null;
} {
  return {
    paused,
    mapMode,
    scenarioDate: scenarioDateYmd,
    scenarioTime: scenarioTimeHm,
  };
}

export function setSimulatorState(patch: {
  paused?: boolean;
  mapMode?: SimulatorMapMode;
  scenarioDate?: string | null;
  scenarioTime?: string | null;
}): void {
  if (patch.paused !== undefined) paused = patch.paused;
  if (patch.mapMode !== undefined) {
    mapMode = patch.mapMode;
    if (patch.mapMode === "live") {
      scenarioDateYmd = null;
      scenarioTimeHm = null;
    }
  }
  if (patch.scenarioDate !== undefined && mapMode === "scenario") scenarioDateYmd = patch.scenarioDate;
  if (patch.scenarioTime !== undefined && mapMode === "scenario") scenarioTimeHm = patch.scenarioTime;
}

/** Called after apply-scenario succeeds. */
export function onScenarioApplied(dateYmd: string, timeHm: string): void {
  scenarioDateYmd = dateYmd;
  scenarioTimeHm = timeHm;
  mapMode = "scenario";
  paused = true;
}

function activeProfileInstant(): DateTime | null {
  if (mapMode === "scenario") {
    if (!scenarioDateYmd || !scenarioTimeHm) return null;
    return parseScenarioMoncton(scenarioDateYmd, scenarioTimeHm);
  }
  return getMonctonNow();
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Probability the next micro-event is a car taking a stall (vs leaving), tuned to:
 * - track profile target `r` and short-term `trend`
 * - mean-revert when current share `x` drifts from `r` (stops runaway fill to ~100%)
 * - make new fills rarer when the lot is already congested (hard to hunt a spot)
 */
function fillProbabilityForTick(x: number, r: number, trend: number): number {
  let p = r + 0.16 * trend;
  p -= 2.85 * (x - r);
  if (x > 0.82) {
    const t = Math.min(1, Math.max(0, (x - 0.82) / 0.18));
    p *= 1 - 0.75 * t;
  }
  return Math.min(0.93, Math.max(0.05, p));
}

async function runTick() {
  if (paused) return;

  const spots = await parkingSpotService.findAll({});
  if (spots.length === 0) return;

  const dt = activeProfileInstant();
  if (!dt) return;

  const prof = campusOccupancyInstantForMoncton(dt);
  const { flipsScale, trend } = churnFromTriple(prof.carsPrev, prof.carsCurr, prof.carsNext);

  const envR = process.env.SIM_OCCUPANCY != null ? Number(process.env.SIM_OCCUPANCY) : null;
  const rProfile =
    envR != null && Number.isFinite(envR)
      ? Math.min(1, Math.max(0, envR))
      : targetOccupancyRatio(prof.carsCurr, spots.length);
  const minRatio = minOccupiedSpotsFloor(spots.length) / spots.length;
  const r = Math.max(rProfile, minRatio);

  const hour = dt.setZone(UNBSJ_TIMEZONE).hour;
  const quiet = isQuietCampusHour(hour);
  // Overnight: no "class change" bump at :00 / :30; very few flips (lot is nearly static).
  const transitionMult = quiet ? 1 : Math.min(1.55, classTransitionChurnMultiplier(dt));
  const nSpots = spots.length;
  let toFlip: number;
  if (quiet) {
    toFlip = Math.random() < 0.14 ? 1 : 0;
  } else {
    const effScale = flipsScale * transitionMult;
    const maxFlips = Math.max(2, Math.min(14, Math.round(4.2 * effScale)));
    const rawFlips = Math.round(nSpots * FLIP_FRACTION * effScale);
    toFlip = Math.min(maxFlips, rawFlips);
  }

  let occupiedCount = spots.filter((s) => s.currentStatus === "occupied").length;
  const minOcc = minOccupiedSpotsFloor(spots.length);
  const softFull = Math.min(nSpots - 1, Math.floor(nSpots * Math.min(0.985, r + 0.06)));

  let didUpdate = false;
  for (let i = 0; i < toFlip; i++) {
    const x = occupiedCount / nSpots;
    const pOccupied = fillProbabilityForTick(x, r, trend);
    let towardOccupied = Math.random() < pOccupied;
    if (towardOccupied && occupiedCount >= softFull) {
      towardOccupied = false;
    }
    if (!towardOccupied && occupiedCount <= minOcc) {
      towardOccupied = true;
    }
    let candidates = spots.filter((s) => s.currentStatus === (towardOccupied ? "empty" : "occupied"));
    if (candidates.length === 0) {
      towardOccupied = !towardOccupied;
      candidates = spots.filter((s) => s.currentStatus === (towardOccupied ? "empty" : "occupied"));
    }
    if (!towardOccupied && occupiedCount <= minOcc) {
      towardOccupied = true;
      candidates = spots.filter((s) => s.currentStatus === "empty");
    }
    if (candidates.length === 0) continue;
    const spot = pickRandom(candidates);
    const nextStatus: "occupied" | "empty" = towardOccupied ? "occupied" : "empty";
    await parkingSpotService.updateStatusWithoutLog(spot.id, nextStatus);
    await parkingSpotService.appendStatusReadingLog(spot.id, nextStatus);
    spot.currentStatus = nextStatus;
    occupiedCount += nextStatus === "occupied" ? 1 : -1;
    didUpdate = true;
  }

  if (didUpdate) {
    await invalidateCache("parking-lot-spots");
    await invalidateCache("parking-spots");
    await invalidateCache("parking-spot-logs");
  }
}

export function startSimulator() {
  setInterval(() => runTick().catch(console.error), INTERVAL_MS);
  console.log("Simulator started: updating parking spot statuses every", INTERVAL_MS / 1000, "s");
}

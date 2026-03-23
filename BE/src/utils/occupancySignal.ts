/**
 * Pluggable campus-level occupancy signal (cars prev/curr/next) for simulator + scenario assign.
 * Default: delegates to `campusOccupancyProfile`. Swap via env or `setOccupancySignalProviderOverride`.
 */
import { DateTime } from "luxon";
import * as profile from "./campusOccupancyProfile";

export type OccupancySignalSourceId = "heuristic_profile" | "data_driven_model";

export type CampusOccupancyInstant = {
  slotIndex: number;
  carsPrev: number;
  carsCurr: number;
  carsNext: number;
  weekendMultiplier: number;
  source: OccupancySignalSourceId;
};

export interface OccupancySignalProvider {
  readonly id: OccupancySignalSourceId;
  instant(dt: DateTime): CampusOccupancyInstant;
}

class HeuristicProfileOccupancyProvider implements OccupancySignalProvider {
  readonly id: OccupancySignalSourceId = "heuristic_profile";

  instant(dt: DateTime): CampusOccupancyInstant {
    const p = profile.profileInstantForMoncton(dt);
    return {
      slotIndex: p.slotIndex,
      carsPrev: p.carsPrev,
      carsCurr: p.carsCurr,
      carsNext: p.carsNext,
      weekendMultiplier: p.weekendMultiplier,
      source: this.id,
    };
  }
}

function normalizeSourceEnv(): string {
  return (process.env.OCCUPANCY_SIGNAL_SOURCE ?? "heuristic_profile").trim().toLowerCase();
}

let providerCache: OccupancySignalProvider | null = null;
let warnedDataDrivenFallback = false;
let providerOverride: OccupancySignalProvider | null = null;

export function getOccupancySignalProvider(): OccupancySignalProvider {
  if (providerOverride) return providerOverride;
  if (providerCache) return providerCache;

  const raw = normalizeSourceEnv();
  const wantsModel =
    raw === "data_driven_model" || raw === "model" || raw === "ml" || raw === "ddm";

  if (wantsModel && !warnedDataDrivenFallback) {
    warnedDataDrivenFallback = true;
    console.warn(
      "[occupancySignal] OCCUPANCY_SIGNAL_SOURCE requests a data-driven model, but none is registered; using heuristic_profile until implemented.",
    );
  }

  providerCache = new HeuristicProfileOccupancyProvider();
  return providerCache;
}

export function setOccupancySignalProviderOverride(provider: OccupancySignalProvider | null): void {
  providerOverride = provider;
}

export function resetOccupancySignalProviderCache(): void {
  providerCache = null;
  warnedDataDrivenFallback = false;
}

export function campusOccupancyInstantForMoncton(dt: DateTime): CampusOccupancyInstant {
  return getOccupancySignalProvider().instant(dt);
}

import type { DayArrivalPlanResponse, DayArrivalSegment } from "../api/types";

const LS_KEY = "debugParkingPlan";

/** Dev builds, or set `localStorage.setItem('debugParkingPlan', '1')` and refresh. */
export function isParkingPlanDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function segmentSummary(seg: DayArrivalSegment, index: number): Record<string, unknown> {
  if (seg.type === "stay_on_campus") {
    return {
      index,
      type: seg.type,
      gapMinutes: seg.gapMinutes,
      between: `${seg.previousClass.classCode} → ${seg.nextClass.classCode}`,
    };
  }
  if (seg.type === "no_parking_available") {
    return {
      index,
      type: seg.type,
      parkingStep: seg.parkingStep,
      classCode: seg.targetClass.classCode,
      classIndex: seg.targetClass.classIndex,
      message: seg.message,
    };
  }
  const c = seg.targetClass;
  return {
    index,
    type: seg.type,
    classCode: c.classCode,
    classIndex: c.classIndex,
    lotId: seg.parking.lot.id,
    lotName: seg.parking.lot.name,
    lotCapacity: seg.parking.lot.capacity,
    spotId: seg.parking.spot.id,
    spotLabel: seg.parking.spot.label,
    distanceMeters: seg.parking.distanceMeters,
    freeSpotsInSelectedLot: seg.parking.freeSpotsInSelectedLot,
    occupancyPercent: seg.parking.occupancyPercent,
    recommendedArriveBy: seg.timing.recommendedArriveBy,
    occupancyScenario: seg.occupancyScenario,
  };
}

function checkParkingSegmentMismatches(seg: DayArrivalSegment, index: number, prefix: string): string[] {
  const warnings: string[] = [];
  if (seg.type !== "initial_arrival" && seg.type !== "return_and_park") return warnings;

  const { parking } = seg;
  const free = parking.freeSpotsInSelectedLot;
  const pct = parking.occupancyPercent;
  const cap = parking.lot.capacity;

  if (free <= 0) {
    warnings.push(
      `${prefix} segment[${index}] (${seg.type}): freeSpotsInSelectedLot is ${free} but a stall is still recommended — BE/UI mismatch? lot=${parking.lot.name} spot=${parking.spot.label}`
    );
  }
  if (cap > 0 && free >= 0) {
    const impliedPct = Math.round((1 - free / cap) * 100);
    const clamped = Math.min(100, Math.max(0, impliedPct));
    if (Math.abs(clamped - pct) > 3) {
      warnings.push(
        `${prefix} segment[${index}]: occupancyPercent=${pct}% vs implied from free/capacity≈${clamped}% (free=${free}, cap=${cap})`
      );
    }
  }
  if (pct >= 100 && free > 0) {
    warnings.push(
      `${prefix} segment[${index}]: occupancyPercent>=100 but freeSpots=${free} — inconsistent`
    );
  }
  return warnings;
}

/** Log one arrival-plan API payload and run consistency checks. */
export function logArrivalPlanDebug(source: string, plan: DayArrivalPlanResponse): void {
  if (!isParkingPlanDebugEnabled()) return;

  const prefix = `[parking-plan:${source}]`;
  const rows = plan.segments.map((s, i) => segmentSummary(s, i));
  console.groupCollapsed(`${prefix} ${plan.selectedDate} · mode=${plan.predictionMode} · event=${plan.eventSize}`);
  console.log("summary", {
    selectedDate: plan.selectedDate,
    predictionMode: plan.predictionMode,
    eventSize: plan.eventSize,
    forecastedAt: plan.forecastedAt,
    segmentCount: plan.segments.length,
  });
  console.table(rows);

  const warnings: string[] = [];
  plan.segments.forEach((seg, i) => {
    warnings.push(...checkParkingSegmentMismatches(seg, i, source));
  });
  if (warnings.length) {
    console.warn(`${prefix} mismatch / sanity checks`, warnings);
  } else {
    console.log(`${prefix} no mismatch warnings (free vs occupancy heuristic)`);
  }
  console.groupEnd();
}

/** What-if: log baseline + scenario and a side-by-side table for parking steps. */
export function logWhatIfArrivalPlans(
  baseline: DayArrivalPlanResponse | null,
  scenario: DayArrivalPlanResponse,
  eventSize: string
): void {
  if (!isParkingPlanDebugEnabled()) return;

  if (baseline) {
    logArrivalPlanDebug("WhatIf·baseline(no event)", baseline);
  }
  logArrivalPlanDebug("WhatIf·scenario", scenario);

  const n = Math.max(baseline?.segments.length ?? 0, scenario.segments.length);
  const diffRows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const b = baseline?.segments[i];
    const s = scenario.segments[i];
    if (!b && !s) continue;
    const bPark = b && (b.type === "initial_arrival" || b.type === "return_and_park") ? b : null;
    const sPark = s && (s.type === "initial_arrival" || s.type === "return_and_park") ? s : null;
    diffRows.push({
      i,
      bType: b?.type ?? "—",
      sType: s?.type ?? "—",
      bLot: bPark?.parking.lot.name ?? "—",
      sLot: sPark?.parking.lot.name ?? "—",
      bFree: bPark?.parking.freeSpotsInSelectedLot ?? "—",
      sFree: sPark?.parking.freeSpotsInSelectedLot ?? "—",
      bSpot: bPark?.parking.spot.label ?? "—",
      sSpot: sPark?.parking.spot.label ?? "—",
    });
  }
  if (diffRows.length) {
    console.log(`[parking-plan:WhatIf] side-by-side · date=${scenario.selectedDate} · event=${eventSize}`);
    console.table(diffRows);
  }
}

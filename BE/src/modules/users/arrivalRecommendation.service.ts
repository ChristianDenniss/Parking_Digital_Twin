import type { Course } from "../classes/course.entity";
import type { ClassSchedule } from "../classSchedule/classSchedule.entity";
import type { ParkingLot } from "../parkingLots/parkingLot.entity";
import type { ParkingSpot } from "../parkingSpots/parkingSpot.entity";
import { DateTime } from "luxon";
import { UNBSJ_TIMEZONE } from "../../utils/campusOccupancyProfile";
import * as studentService from "../students/student.service";
import * as classScheduleService from "../classSchedule/classSchedule.service";
import * as buildingService from "../buildings/building.service";
import * as parkingLotService from "../parkingLots/parkingLot.service";
import { isUserEligibleForLot } from "../parkingLots/parkingLotEligibility";
import type { UserParkingEligibility } from "../parkingLots/parkingLotEligibility";
import { hasPlausibleMeetingTimes } from "../classes/courseMeetingTime.util";
import * as parkingOccupancyAssign from "../parkingSpots/parkingOccupancyAssign.service";
import {
  DEFAULT_ARRIVAL_PLAN_TERM_CODE,
  getArrivalPlanTermCodes,
  normalizeArrivalTermCode,
} from "../../utils/arrivalPlanTerms";
import * as userService from "./user.service";
import { predictOccupancy } from "../prediction/prediction.service";
import type { EventSize } from "../prediction/prediction.types";

/** Walking speed assumption (meters per minute) ~4.8 km/h */
export const DEFAULT_WALK_METERS_PER_MINUTE = 80;

/** Minutes added per building floor (ground/1/2 counts as 2 floors for room on floor 2). */
export const DEFAULT_MINUTES_PER_FLOOR = 2;

/** Optional buffer before class start once travel is done (set to 0 to match walk + floors + congestion only). */
export const DEFAULT_PREP_BUFFER_MINUTES = 0;

/** Max extra minutes from lot congestion (finding a stall) tied to occupancy. */
export const CONGESTION_OCCUPANCY_SCALE = 0.12; // ~12 min at 100% full

/**
 * If the gap between the previous class end and the next class start exceeds this many minutes,
 * we assume you left campus and need a fresh parking recommendation for the next class.
 */
export const GAP_MINUTES_ASSUME_LEFT_CAMPUS = 60;

const DEFAULT_CLASS_DURATION_MS = 50 * 60 * 1000;

function courseMatchesArrivalTermFilter(course: Course, allowedNormalized: ReadonlySet<string>): boolean {
  const t = course.term?.trim();
  if (!t) return false;
  return allowedNormalized.has(normalizeArrivalTermCode(t));
}

function combineDateAndTime(day: Date, timeStr: string): Date {
  const parts = timeStr.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const d = new Date(day);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/** Parse `YYYY-MM-DD` as a local calendar date at midnight (no UTC shift). */
export function parseLocalDateFromYyyyMmDd(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10) - 1;
  const d = parseInt(m[3]!, 10);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function formatLocalYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Infer floor index from room label (e.g. 207 → 2). Used for in-building travel time.
 */
export function inferFloorFromRoom(room: string | null | undefined): number {
  if (!room) return 1;
  const trimmed = room.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length >= 3 && /^\d+$/.test(digitsOnly)) {
    const f = parseInt(digitsOnly[0]!, 10);
    if (f >= 1 && f <= 9) return f;
  }
  const m = trimmed.match(/^(\d)/);
  if (m) {
    const f = parseInt(m[1]!, 10);
    if (f >= 1 && f <= 9) return f;
  }
  return 1;
}

export type ArrivalClassSummary = {
  /** 1-based order of this class among valid classes that day (after sort). */
  classIndex: number;
  scheduleEntryId: string;
  classId: string;
  classCode: string;
  courseName: string | null;
  building: string | null;
  room: string | null;
  inferredFloor: number;
  startsAt: string;
  endsAt: string;
};

/** Moncton civil date + time for `POST /api/parking-spots/apply-scenario` (paused snapshot). */
export type OccupancyScenarioClock = {
  dateYmd: string;
  timeHHmm: string;
};

export type ArrivalParkingBlock = {
  building: {
    id: string;
    name: string;
    code: string | null;
  };
  parking: {
    lot: ParkingLot;
    spot: ParkingSpot;
    distanceMeters: number;
    freeSpotsInSelectedLot: number;
    occupancyPercent: number;
  };
  timing: {
    walkMinutesFromLotToBuilding: number;
    inBuildingNavigationMinutes: number;
    lotCongestionBufferMinutes: number;
    prepBufferMinutes: number;
    totalTravelMinutes: number;
    recommendedArriveBy: string;
  };
  /** When to load the campus parking snapshot for this step (arrive-by instant in Moncton). */
  occupancyScenario: OccupancyScenarioClock;
};

export type DayArrivalSegment =
  | ({
      type: "initial_arrival";
      targetClass: ArrivalClassSummary;
    } & ArrivalParkingBlock)
  | {
      type: "stay_on_campus";
      gapMinutes: number;
      previousClass: ArrivalClassSummary;
      nextClass: ArrivalClassSummary;
      previousEndsAt: string;
      nextStartsAt: string;
    }
  | ({
      type: "return_and_park";
      gapAfterPreviousClassMinutes: number;
      targetClass: ArrivalClassSummary;
    } & ArrivalParkingBlock);

/** Per-lot prediction data pre-fetched for the "predicted" state mode. */
type PredictedLotData = Record<string, { freeSpots: number; occupancyPct: number }>;

export type DayArrivalPlanResult = {
  selectedDate: string;
  /** Term codes included in this plan (e.g. Winter 2026 → `2026/WI`). */
  includedTermCodes: string[];
  scheduleNote: string;
  gapMinutesAssumeLeftCampus: number;
  segments: DayArrivalSegment[];
  /** True when the student has no courses scheduled on this specific day of the week. */
  noClassesOnDay?: boolean;
  assumptions: {
    walkMetersPerMinute: number;
    minutesPerFloor: number;
    congestionModel: string;
  };
  /** Prediction metadata – present on all responses so the FE can branch on stateMode. */
  predictionMode: "current" | "predicted";
  eventSize: EventSize;
  /** ISO timestamp when predictions were computed; null in current mode. */
  forecastedAt: string | null;
  /** Minutes from now to the earliest recommended arrival; null in current mode. */
  forecastHorizonMinutes: number | null;
};

type ClassOnDay = {
  schedule: ClassSchedule;
  course: Course;
  startsAt: Date;
  endsAt: Date;
};

function resolveEndsAt(dayStart: Date, course: Course, startsAt: Date): Date {
  if (!course.endTime || course.endTime.trim() === "" || course.endTime === "00:00") {
    return new Date(startsAt.getTime() + DEFAULT_CLASS_DURATION_MS);
  }
  const endsAt = combineDateAndTime(dayStart, course.endTime);
  if (endsAt.getTime() <= startsAt.getTime()) {
    return new Date(startsAt.getTime() + DEFAULT_CLASS_DURATION_MS);
  }
  return endsAt;
}

/**
 * Maps the last letter of a Banner section code to the JS day-of-week numbers (0=Sun…6=Sat)
 * on which that section typically meets at UNBSJ.
 * Returns null when the pattern is unknown (treat as "meets every weekday" to be safe).
 */
export function getMeetingDaysFromSectionCode(sectionCode: string | null | undefined): number[] | null {
  if (!sectionCode) return null;
  const letter = sectionCode.trim().slice(-1).toUpperCase();
  switch (letter) {
    case "A": return [1, 3];       // Mon, Wed
    case "B": return [2, 4];       // Tue, Thu
    case "C": return [1, 3, 5];    // Mon, Wed, Fri
    case "D": return [1];          // Mon only
    case "F": return [5];          // Fri only
    default:  return null;         // unknown — caller decides
  }
}

/**
 * Returns whether a course meets on `selectedDayJsDay` (0=Sun…6=Sat).
 * Unknown section codes are included on weekdays (1–5) and excluded on weekends.
 */
export function courseMeetsOnDay(course: Course, selectedDayJsDay: number): boolean {
  const days = getMeetingDaysFromSectionCode(course.sectionCode);
  if (days !== null) return days.includes(selectedDayJsDay);
  // Unknown pattern: include Mon–Fri, exclude Sat/Sun
  return selectedDayJsDay >= 1 && selectedDayJsDay <= 5;
}

/**
 * Finds all courses meeting on `selectedDay`, filtered by term and day-of-week derived from
 * the section code suffix (A=Mon/Wed, B=Tue/Thu, C=Mon/Wed/Fri; unknown codes are excluded
 * on weekends and included on weekdays).
 */
function findAllClassesOnSelectedDay(
  schedules: ClassSchedule[],
  selectedDayStart: Date,
  allowedTermCodesNormalized: ReadonlySet<string>
): ClassOnDay[] {
  const selectedDayJsDay = selectedDayStart.getDay(); // 0=Sun…6=Sat
  const out: ClassOnDay[] = [];
  for (const s of schedules) {
    const c = s.course;
    if (!c) continue;
    if (!courseMatchesArrivalTermFilter(c, allowedTermCodesNormalized)) continue;
    if (!hasPlausibleMeetingTimes(c.startTime, c.endTime)) continue;
    if (!c.building?.trim()) continue;
    if (!courseMeetsOnDay(c, selectedDayJsDay)) continue;
    const startsAt = combineDateAndTime(selectedDayStart, c.startTime);
    const endsAt = resolveEndsAt(selectedDayStart, c, startsAt);
    out.push({ schedule: s, course: c, startsAt, endsAt });
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

function occupancyScenarioFromArriveBy(recommendedArriveBy: Date): OccupancyScenarioClock {
  const dt = DateTime.fromJSDate(recommendedArriveBy).setZone(UNBSJ_TIMEZONE);
  if (!dt.isValid) {
    const fb = DateTime.now().setZone(UNBSJ_TIMEZONE);
    return { dateYmd: fb.toFormat("yyyy-MM-dd"), timeHHmm: fb.toFormat("HH:mm") };
  }
  return { dateYmd: dt.toFormat("yyyy-MM-dd"), timeHHmm: dt.toFormat("HH:mm") };
}

function toClassSummary(
  item: ClassOnDay,
  classIndex: number
): ArrivalClassSummary {
  const inferredFloor = inferFloorFromRoom(item.course.room);
  return {
    classIndex,
    scheduleEntryId: item.schedule.id,
    classId: item.course.id,
    classCode: item.course.classCode,
    courseName: item.course.name,
    building: item.course.building,
    room: item.course.room,
    inferredFloor,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
  };
}

function lotPredictedOccupancyPercent(
  lotId: string,
  spotIdToStatus: Map<string, "occupied" | "empty">,
  spotRows: { id: string; parkingLotId: string }[]
): number {
  const inLot = spotRows.filter((r) => r.parkingLotId === lotId);
  if (inLot.length === 0) return 0;
  const occ = inLot.filter((r) => (spotIdToStatus.get(r.id) ?? "empty") === "occupied").length;
  return Math.round((occ / inLot.length) * 100);
}

/**
 * Pre-fetch occupancy predictions for all lots near a building at the given moment.
 * Returns a map of lotId → { freeSpots, occupancyPct } used in predicted mode.
 */
async function buildPredictedLotData(
  buildingId: string,
  targetDatetime: Date,
  eventSize: EventSize,
  eligibility: UserParkingEligibility,
): Promise<PredictedLotData> {
  const rankedLots = await parkingLotService.findRecommendationsByBuilding(buildingId);
  const eligible = rankedLots.filter((r) => isUserEligibleForLot(r.lot.name, eligibility));

  // Snap to the top of the hour to avoid circular dependency (arrival time → prediction → lot choice → arrival time)
  const snapped = new Date(targetDatetime);
  snapped.setMinutes(0, 0, 0);

  const results = await Promise.all(
    eligible.map(async (r) => {
      const pred = await predictOccupancy(r.lot.id, snapped, { eventSize, useEnrollment: true });
      if (!pred) return null;
      return [r.lot.id, { freeSpots: pred.predictedFreeSpots, occupancyPct: pred.predictedOccupancyPct }] as const;
    }),
  );

  return Object.fromEntries(results.filter((e): e is NonNullable<typeof e> => e !== null));
}

/**
 * Pick a stall using the same deterministic scenario snapshot as the day plan / map apply,
 * iterating arrive-time until stable (~90s) so congestion buffer matches the forecast lot.
 * When predictedLotData is supplied the occupancy % comes from the prediction engine instead
 * of the scenario snapshot.
 */
async function buildParkingBlockForCourse(
  course: Course,
  startsAt: Date,
  walkMpm: number,
  minPerFloor: number,
  prepBuffer: number,
  stateMode: "current" | "predicted",
  parkingEligibility: UserParkingEligibility,
  predictedLotData?: PredictedLotData,
): Promise<ArrivalParkingBlock | null> {
  const building = await buildingService.findBuildingForCourseBuilding(course.building);
  if (!building) return null;

  // In predicted mode, pass predicted free spots so recommendBestParking uses the forecast
  const predictedFreeSpotsByLotId: Record<string, number> | undefined =
    stateMode === "predicted" && predictedLotData
      ? Object.fromEntries(Object.entries(predictedLotData).map(([id, d]) => [id, d.freeSpots]))
      : undefined;

  let arriveGuess = new Date(startsAt.getTime() - 45 * 60 * 1000);
  let parking: Awaited<ReturnType<typeof parkingLotService.recommendBestParking>> = null;
  let spotIdToStatus: Map<string, "occupied" | "empty"> = new Map();
  let spotRows: { id: string; parkingLotId: string }[] = [];

  for (let iter = 0; iter < 4; iter++) {
    const { dateYmd, timeHHmm } = occupancyScenarioFromArriveBy(arriveGuess);
    const preview = await parkingOccupancyAssign.previewScenarioAssignmentAt(dateYmd, timeHHmm);
    spotIdToStatus = preview.spotIdToStatus;
    spotRows = preview.spotRows;

    parking = await parkingLotService.recommendBestParking({
      buildingId: building.id,
      stateMode,
      parkingEligibility,
      predictedSpotStatusByLotId: preview.predictedSpotStatusByLotId,
      predictedFreeSpotsByLotId,
    });
    if (!parking) return null;

    const walkMinutesFromLotToBuilding = Math.max(1, Math.ceil(parking.distanceMeters / walkMpm));
    const inferredFloor = inferFloorFromRoom(course.room);
    const inBuildingNavigationMinutes = inferredFloor * minPerFloor;

    // Use prediction engine occupancy when available, else fall back to scenario snapshot
    const occupancyPercent =
      stateMode === "predicted" && predictedLotData?.[parking.lot.id] !== undefined
        ? Math.round(predictedLotData[parking.lot.id]!.occupancyPct)
        : lotPredictedOccupancyPercent(parking.lot.id, spotIdToStatus, spotRows);

    const lotCongestionBufferMinutes = Math.min(
      15,
      Math.round(occupancyPercent * CONGESTION_OCCUPANCY_SCALE),
    );

    const totalTravelMinutes =
      walkMinutesFromLotToBuilding +
      inBuildingNavigationMinutes +
      lotCongestionBufferMinutes +
      prepBuffer;

    const recommendedArriveBy = new Date(startsAt.getTime() - totalTravelMinutes * 60 * 1000);
    if (Math.abs(recommendedArriveBy.getTime() - arriveGuess.getTime()) < 90_000) {
      return {
        building: { id: building.id, name: building.name, code: building.code },
        parking: {
          lot: parking.lot,
          spot: parking.spot,
          distanceMeters: parking.distanceMeters,
          freeSpotsInSelectedLot:
            stateMode === "predicted" && predictedLotData?.[parking.lot.id] !== undefined
              ? predictedLotData[parking.lot.id]!.freeSpots
              : parking.freeSpotsInSelectedLot,
          occupancyPercent,
        },
        timing: {
          walkMinutesFromLotToBuilding,
          inBuildingNavigationMinutes,
          lotCongestionBufferMinutes,
          prepBufferMinutes: prepBuffer,
          totalTravelMinutes,
          recommendedArriveBy: recommendedArriveBy.toISOString(),
        },
        occupancyScenario: occupancyScenarioFromArriveBy(recommendedArriveBy),
      };
    }
    arriveGuess = recommendedArriveBy;
  }

  // Final iteration fallback
  if (!parking) return null;
  const walkMinutesFromLotToBuilding = Math.max(1, Math.ceil(parking.distanceMeters / walkMpm));
  const inferredFloor = inferFloorFromRoom(course.room);
  const inBuildingNavigationMinutes = inferredFloor * minPerFloor;
  const occupancyPercent =
    stateMode === "predicted" && predictedLotData?.[parking.lot.id] !== undefined
      ? Math.round(predictedLotData[parking.lot.id]!.occupancyPct)
      : lotPredictedOccupancyPercent(parking.lot.id, spotIdToStatus, spotRows);
  const lotCongestionBufferMinutes = Math.min(15, Math.round(occupancyPercent * CONGESTION_OCCUPANCY_SCALE));
  const totalTravelMinutes =
    walkMinutesFromLotToBuilding + inBuildingNavigationMinutes + lotCongestionBufferMinutes + prepBuffer;
  const recommendedArriveBy = new Date(startsAt.getTime() - totalTravelMinutes * 60 * 1000);

  return {
    building: { id: building.id, name: building.name, code: building.code },
    parking: {
      lot: parking.lot,
      spot: parking.spot,
      distanceMeters: parking.distanceMeters,
      freeSpotsInSelectedLot:
        stateMode === "predicted" && predictedLotData?.[parking.lot.id] !== undefined
          ? predictedLotData[parking.lot.id]!.freeSpots
          : parking.freeSpotsInSelectedLot,
      occupancyPercent,
    },
    timing: {
      walkMinutesFromLotToBuilding,
      inBuildingNavigationMinutes,
      lotCongestionBufferMinutes,
      prepBufferMinutes: prepBuffer,
      totalTravelMinutes,
      recommendedArriveBy: recommendedArriveBy.toISOString(),
    },
    occupancyScenario: occupancyScenarioFromArriveBy(recommendedArriveBy),
  };
}

export async function getArrivalRecommendationForUser(
  userId: string,
  options: {
    selectedDate: Date;
    walkMetersPerMinute?: number;
    minutesPerFloor?: number;
    prepBufferMinutes?: number;
    stateMode?: "current" | "predicted";
    eventSize?: EventSize;
    gapMinutesAssumeLeftCampus?: number;
  },
): Promise<DayArrivalPlanResult | null> {
  const selectedDayStart = new Date(options.selectedDate);
  selectedDayStart.setHours(0, 0, 0, 0);

  const walkMpm      = options.walkMetersPerMinute ?? DEFAULT_WALK_METERS_PER_MINUTE;
  const minPerFloor  = options.minutesPerFloor ?? DEFAULT_MINUTES_PER_FLOOR;
  const prepBuffer   = options.prepBufferMinutes ?? DEFAULT_PREP_BUFFER_MINUTES;
  const stateMode    = options.stateMode ?? "current";
  const eventSize: EventSize = options.eventSize ?? "none";
  const gapThreshold = options.gapMinutesAssumeLeftCampus ?? GAP_MINUTES_ASSUME_LEFT_CAMPUS;

  const student = await studentService.findByUserId(userId);
  if (!student) return null;

  const user = await userService.findById(userId, false);
  if (!user) return null;
  const parkingEligibility: UserParkingEligibility = { role: user.role, resident: user.resident, disabled: user.disabled };

  const includedTermCodes = getArrivalPlanTermCodes();
  const allowedTermCodesNormalized = new Set(includedTermCodes.map(normalizeArrivalTermCode));

  const schedules = await classScheduleService.findAll({ studentId: student.id }, ["course"]);
  const classesOnDay = findAllClassesOnSelectedDay(schedules, selectedDayStart, allowedTermCodesNormalized);
  if (classesOnDay.length === 0) {
    const dow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][selectedDayStart.getDay()]!;
    return {
      selectedDate: formatLocalYyyyMmDd(selectedDayStart),
      includedTermCodes,
      scheduleNote: `No courses with a building are scheduled on ${dow}s for the active term(s): ${includedTermCodes.join(", ")}.`,
      noClassesOnDay: true,
      gapMinutesAssumeLeftCampus: gapThreshold,
      segments: [],
      assumptions: {
        walkMetersPerMinute: walkMpm,
        minutesPerFloor: minPerFloor,
        congestionModel: `min(15, round(occupancyPercent * ${CONGESTION_OCCUPANCY_SCALE})) minutes`,
      },
      predictionMode: stateMode,
      eventSize,
      forecastedAt: null,
      forecastHorizonMinutes: null,
    };
  }

  const forecastedAt = stateMode === "predicted" ? new Date().toISOString() : null;
  const segments: DayArrivalSegment[] = [];

  // Helper: lazily build predicted lot data per building (cached within this plan request)
  const predictedDataCache = new Map<string, PredictedLotData>();
  async function resolvePredictedData(buildingId: string, targetDatetime: Date): Promise<PredictedLotData | undefined> {
    if (stateMode !== "predicted") return undefined;
    const key = `${buildingId}:${targetDatetime.toISOString()}`;
    if (!predictedDataCache.has(key)) {
      predictedDataCache.set(key, await buildPredictedLotData(buildingId, targetDatetime, eventSize, parkingEligibility));
    }
    return predictedDataCache.get(key);
  }

  // First class
  const first = classesOnDay[0]!;
  const firstBuilding = await buildingService.findBuildingForCourseBuilding(first.course.building);
  const firstPredicted = firstBuilding
    ? await resolvePredictedData(firstBuilding.id, first.startsAt)
    : undefined;

  const firstSummary = toClassSummary(first, 1);
  const firstBlock = await buildParkingBlockForCourse(
    first.course, first.startsAt, walkMpm, minPerFloor, prepBuffer,
    stateMode, parkingEligibility, firstPredicted,
  );
  if (!firstBlock) return null;
  segments.push({ type: "initial_arrival", targetClass: firstSummary, ...firstBlock });

  for (let i = 1; i < classesOnDay.length; i++) {
    const prev = classesOnDay[i - 1]!;
    const curr = classesOnDay[i]!;
    const gapMs = curr.startsAt.getTime() - prev.endsAt.getTime();
    const gapMinutes = Math.max(0, Math.round(gapMs / 60000));
    const prevSummary = toClassSummary(prev, i);
    const currSummary = toClassSummary(curr, i + 1);

    if (gapMinutes > gapThreshold) {
      const currBuilding = await buildingService.findBuildingForCourseBuilding(curr.course.building);
      const currPredicted = currBuilding
        ? await resolvePredictedData(currBuilding.id, curr.startsAt)
        : undefined;
      const block = await buildParkingBlockForCourse(
        curr.course, curr.startsAt, walkMpm, minPerFloor, prepBuffer,
        stateMode, parkingEligibility, currPredicted,
      );
      if (!block) return null;
      segments.push({
        type: "return_and_park",
        gapAfterPreviousClassMinutes: gapMinutes,
        targetClass: currSummary,
        ...block,
      });
    } else {
      segments.push({
        type: "stay_on_campus",
        gapMinutes,
        previousClass: prevSummary,
        nextClass: currSummary,
        previousEndsAt: prev.endsAt.toISOString(),
        nextStartsAt: curr.startsAt.toISOString(),
      });
    }
  }

  // Compute forecast horizon (minutes to earliest recommended arrival)
  let forecastHorizonMinutes: number | null = null;
  if (stateMode === "predicted") {
    const arrivalSegments = segments.filter(
      (s): s is Extract<DayArrivalSegment, { timing: unknown }> => "timing" in s,
    );
    if (arrivalSegments.length > 0) {
      const earliest = Math.min(
        ...arrivalSegments.map((s) => new Date(s.timing.recommendedArriveBy).getTime()),
      );
      forecastHorizonMinutes = Math.round((earliest - Date.now()) / 60_000);
    }
  }

  return {
    selectedDate: formatLocalYyyyMmDd(selectedDayStart),
    includedTermCodes,
    scheduleNote:
      `Only classes in term code(s) ${includedTermCodes.join(", ")} are included (default ${DEFAULT_ARRIVAL_PLAN_TERM_CODE} = Winter 2026). ` +
      "Courses with placeholder meeting times (e.g. 00:00-00:00, 00:00-23:59, or blocks over 14 hours) are excluded. " +
      "Day-of-week is inferred from the section code suffix (A=Mon/Wed, B=Tue/Thu, C=Mon/Wed/Fri). Unknown patterns are excluded on weekends. Classes are ordered by start time.",
    gapMinutesAssumeLeftCampus: gapThreshold,
    segments,
    assumptions: {
      walkMetersPerMinute: walkMpm,
      minutesPerFloor: minPerFloor,
      congestionModel: `min(15, round(occupancyPercent * ${CONGESTION_OCCUPANCY_SCALE})) minutes`,
    },
    predictionMode: stateMode,
    eventSize,
    forecastedAt,
    forecastHorizonMinutes,
  };
}

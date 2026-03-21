import type { Course } from "../classes/course.entity";
import type { ClassSchedule } from "../classSchedule/classSchedule.entity";
import type { ParkingLot } from "../parkingLots/parkingLot.entity";
import type { ParkingSpot } from "../parkingSpots/parkingSpot.entity";
import * as studentService from "../students/student.service";
import * as classScheduleService from "../classSchedule/classSchedule.service";
import * as buildingService from "../buildings/building.service";
import * as parkingLotService from "../parkingLots/parkingLot.service";
import { hasPlausibleMeetingTimes } from "../classes/courseMeetingTime.util";

/** Walking speed assumption (meters per minute) ~4.8 km/h */
export const DEFAULT_WALK_METERS_PER_MINUTE = 80;

/** Minutes added per building floor (ground→1→2 counts as 2 floors for room on floor 2). */
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

/**
 * Only schedule rows whose course `term` matches one of these codes are used for parking plans.
 * Default matches scraped UNB catalog: Winter 2026 → `2026/WI`.
 * Override with `ARRIVAL_PLAN_TERM` (single code) or `ARRIVAL_PLAN_TERM_CODES` (comma-separated).
 */
export const DEFAULT_ARRIVAL_PLAN_TERM_CODE = "2026/WI";

const DEFAULT_CLASS_DURATION_MS = 50 * 60 * 1000;

function normalizeTermCode(s: string): string {
  return s.trim().toUpperCase();
}

/** Term codes to include in arrival / day parking recommendations (normalized matching). */
export function getArrivalPlanTermCodes(): string[] {
  const multi = process.env.ARRIVAL_PLAN_TERM_CODES?.trim();
  if (multi) {
    return multi
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  const single = process.env.ARRIVAL_PLAN_TERM?.trim();
  if (single) return [single];
  return [DEFAULT_ARRIVAL_PLAN_TERM_CODE];
}

function courseMatchesArrivalTermFilter(course: Course, allowedNormalized: ReadonlySet<string>): boolean {
  const t = course.term?.trim();
  if (!t) return false;
  return allowedNormalized.has(normalizeTermCode(t));
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

export type DayArrivalPlanResult = {
  selectedDate: string;
  /** Term codes included in this plan (e.g. Winter 2026 → `2026/WI`). */
  includedTermCodes: string[];
  scheduleNote: string;
  gapMinutesAssumeLeftCampus: number;
  segments: DayArrivalSegment[];
  assumptions: {
    walkMetersPerMinute: number;
    minutesPerFloor: number;
    congestionModel: string;
  };
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
 * Until day-of-week exists on enrollments, every matching class is treated as meeting on `selectedDay`.
 * Courses are restricted to `allowedTermCodes` (Winter 2026 by default).
 */
function findAllClassesOnSelectedDay(
  schedules: ClassSchedule[],
  selectedDayStart: Date,
  allowedTermCodesNormalized: ReadonlySet<string>
): ClassOnDay[] {
  const out: ClassOnDay[] = [];
  for (const s of schedules) {
    const c = s.course;
    if (!c) continue;
    if (!courseMatchesArrivalTermFilter(c, allowedTermCodesNormalized)) continue;
    if (!hasPlausibleMeetingTimes(c.startTime, c.endTime)) continue;
    if (!c.building?.trim()) continue;
    const startsAt = combineDateAndTime(selectedDayStart, c.startTime);
    const endsAt = resolveEndsAt(selectedDayStart, c, startsAt);
    out.push({ schedule: s, course: c, startsAt, endsAt });
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
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

async function buildParkingBlockForCourse(
  course: Course,
  startsAt: Date,
  walkMpm: number,
  minPerFloor: number,
  prepBuffer: number,
  stateMode: "current" | "predicted"
): Promise<ArrivalParkingBlock | null> {
  const building = await buildingService.findBuildingForCourseBuilding(course.building);
  if (!building) return null;

  const parking = await parkingLotService.recommendBestParking({
    buildingId: building.id,
    stateMode,
  });
  if (!parking) return null;

  const ranked = await parkingLotService.findRecommendationsByBuilding(building.id);
  const lotMeta = ranked.find((r) => r.lot.id === parking.lot.id);
  const occupancyPercent = lotMeta?.occupancyPercent ?? 0;

  const walkMinutesFromLotToBuilding = Math.max(1, Math.ceil(parking.distanceMeters / walkMpm));
  const inferredFloor = inferFloorFromRoom(course.room);
  const inBuildingNavigationMinutes = inferredFloor * minPerFloor;
  const lotCongestionBufferMinutes = Math.min(
    15,
    Math.round(occupancyPercent * CONGESTION_OCCUPANCY_SCALE)
  );

  const totalTravelMinutes =
    walkMinutesFromLotToBuilding +
    inBuildingNavigationMinutes +
    lotCongestionBufferMinutes +
    prepBuffer;

  const recommendedArriveBy = new Date(startsAt.getTime() - totalTravelMinutes * 60 * 1000);

  return {
    building: {
      id: building.id,
      name: building.name,
      code: building.code,
    },
    parking: {
      lot: parking.lot,
      spot: parking.spot,
      distanceMeters: parking.distanceMeters,
      freeSpotsInSelectedLot: parking.freeSpotsInSelectedLot,
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
    /** Override default 60-minute gap rule (minutes). */
    gapMinutesAssumeLeftCampus?: number;
  }
): Promise<DayArrivalPlanResult | null> {
  const selectedDayStart = new Date(options.selectedDate);
  selectedDayStart.setHours(0, 0, 0, 0);

  const walkMpm = options.walkMetersPerMinute ?? DEFAULT_WALK_METERS_PER_MINUTE;
  const minPerFloor = options.minutesPerFloor ?? DEFAULT_MINUTES_PER_FLOOR;
  const prepBuffer = options.prepBufferMinutes ?? DEFAULT_PREP_BUFFER_MINUTES;
  const stateMode = options.stateMode ?? "current";
  const gapThreshold =
    options.gapMinutesAssumeLeftCampus ?? GAP_MINUTES_ASSUME_LEFT_CAMPUS;

  const student = await studentService.findByUserId(userId);
  if (!student) return null;

  const includedTermCodes = getArrivalPlanTermCodes();
  const allowedTermCodesNormalized = new Set(includedTermCodes.map(normalizeTermCode));

  const schedules = await classScheduleService.findAll({ studentId: student.id }, ["course"]);
  const classesOnDay = findAllClassesOnSelectedDay(schedules, selectedDayStart, allowedTermCodesNormalized);
  if (classesOnDay.length === 0) return null;

  const segments: DayArrivalSegment[] = [];

  const first = classesOnDay[0]!;
  const firstSummary = toClassSummary(first, 1);
  const firstBlock = await buildParkingBlockForCourse(
    first.course,
    first.startsAt,
    walkMpm,
    minPerFloor,
    prepBuffer,
    stateMode
  );
  if (!firstBlock) return null;

  segments.push({
    type: "initial_arrival",
    targetClass: firstSummary,
    ...firstBlock,
  });

  for (let i = 1; i < classesOnDay.length; i++) {
    const prev = classesOnDay[i - 1]!;
    const curr = classesOnDay[i]!;
    const gapMs = curr.startsAt.getTime() - prev.endsAt.getTime();
    const gapMinutes = Math.max(0, Math.round(gapMs / 60000));

    const prevSummary = toClassSummary(prev, i);
    const currSummary = toClassSummary(curr, i + 1);

    if (gapMinutes > gapThreshold) {
      const block = await buildParkingBlockForCourse(
        curr.course,
        curr.startsAt,
        walkMpm,
        minPerFloor,
        prepBuffer,
        stateMode
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

  return {
    selectedDate: formatLocalYyyyMmDd(selectedDayStart),
    includedTermCodes,
    scheduleNote:
      `Only classes in term code(s) ${includedTermCodes.join(", ")} are included (default ${DEFAULT_ARRIVAL_PLAN_TERM_CODE} = Winter 2026). ` +
      "Courses with placeholder meeting times (e.g. 00:00-00:00, 00:00-23:59, or blocks over 14 hours) are excluded. " +
      "Day-of-week is not stored on class schedule entries yet; matching classes are treated as if they run on this day. Classes are ordered by start time.",
    gapMinutesAssumeLeftCampus: gapThreshold,
    segments,
    assumptions: {
      walkMetersPerMinute: walkMpm,
      minutesPerFloor: minPerFloor,
      congestionModel: `min(15, round(occupancyPercent * ${CONGESTION_OCCUPANCY_SCALE})) minutes`,
    },
  };
}

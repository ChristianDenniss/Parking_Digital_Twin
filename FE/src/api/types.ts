import type { FeatureCollection, Point } from "geojson";

export interface ParkingLot {
  id: string;
  name: string;
  campus: string;
  capacity: number;
  imageUrl: string | null;
  createdAt: string;
}

/** Lot with distance and occupancy when requested with ?buildingId= (for "where to park" optimization). */
export interface ParkingLotWithDistance extends ParkingLot {
  distanceMeters?: number;
  freeSpots?: number;
  occupancyPercent?: number;
}

/** GET /api/parking-lots/forecast */
export interface ParkingForecastLotRow {
  parkingLotId: string;
  name: string;
  spotCount: number;
  predictedOccupied: number;
  predictedFree: number;
  predictedOccupancyPercent: number;
}

export interface ParkingForecastInsights {
  profileTermLabel: string;
  coursesInProfileFile: number | null;
  profileSlotStart: string;
  profileSlotEnd: string;
  weekendApplied: boolean;
  weekendMultiplier: number;
  modeledCarsOnCampus: number;
  modeledCarsOnCampusMin?: number;
  modeledCarsOnCampusMax?: number;
  profileBusyPercentile: number;
  profileClassEnrolledProxy: number | null;
  profileSectionsMeeting: number | null;
  liveDbClassOverlapEnrollmentSum: number;
  liveDbBuildingsWithClasses: number;
  occupancyTrendNextSlot: "up" | "down" | "steady";
  occupancyTrendSummary: string;
  classTransitionMultiplier: number;
  classTransitionSummary: string | null;
  curveEvenSpreadOccupancyPercent: number;
}

export interface ParkingForecastResponse {
  date: string;
  time: string;
  timezone: string;
  signalSource: "heuristic_profile" | "data_driven_model";
  modelNote: string;
  campusPredictedOccupancyPercent: number;
  kTotal: number;
  totalSpots: number;
  lots: ParkingForecastLotRow[];
  insights: ParkingForecastInsights;
}

export interface Building {
  id: string;
  name: string;
  code: string | null;
  floors: number | null;
  createdAt?: string;
}

/** Properties on features from GET /api/buildings/map-markers/geojson (GEE points + DB buildings). */
export interface BuildingMapMarkerFeatureProperties {
  buildingId: string | null;
  name: string;
  code: string | null;
  floors: number | null;
  latitude: number;
  longitude: number;
  /** Meters (GeoJSON Z or GEE); omit or null when unknown. */
  elevationMeters?: number | null;
  matched: boolean;
  geeProperties?: Record<string, unknown>;
}

export type BuildingMapMarkersGeoJSON = FeatureCollection<Point, BuildingMapMarkerFeatureProperties>;

export type SimulatorMapMode = "live" | "scenario";

export interface SimulatorState {
  paused: boolean;
  mapMode: SimulatorMapMode;
  scenarioDate: string | null;
  scenarioTime: string | null;
}

export interface ParkingSpot {
  id: string;
  parkingLotId: string;
  label: string;
  section: string;
  row: string;
  index: number;
  /** 1-based order in lot SVG (spot layers). Enables 1:1 match by position. */
  slotIndex?: number | null;
  /** Estimated meters from spot to nearest lot exit. */
  distanceFromExit?: number | null;
  /** Designated accessible (disability) stall. */
  isAccessible?: boolean;
  currentStatus: "occupied" | "empty";
  updatedAt: string;
}

export interface ParkingSpotLog {
  id: string;
  parkingSpotId: string;
  status: "occupied" | "empty";
  recordedAt: string;
  /** Present when API loads the parkingSpot relation (includes label for display). */
  parkingSpot?: { id: string; label: string };
}

/** Public user fields returned from auth and user APIs */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  role: "staff" | "student" | "phd_candidate";
  /** On-campus resident; resident parking eligibility */
  resident: boolean;
  /** Accessible / disabled parking stall eligibility */
  disabled: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface MeResponse extends PublicUser {
  student: {
    id: string;
    studentId: string;
    email: string;
    name: string;
    year: number | null;
  } | null;
}

export interface Course {
  id: string;
  classCode: string;
  startTime: string;
  endTime: string;
  name: string | null;
  term: string | null;
  building?: string | null;
  room?: string | null;
  sectionCode?: string | null;
  enrolled?: number | null;
  capacity?: number | null;
  createdAt?: string;
}

export interface ScheduleEntry {
  id: string;
  studentId: string;
  classId: string;
  term: string | null;
  section: string | null;
  createdAt: string;
  course: {
    id: string;
    classCode: string;
    name: string | null;
    startTime: string;
    endTime: string;
    term: string | null;
    building: string | null;
    room: string | null;
    sectionCode: string | null;
    enrolled: number | null;
    capacity: number | null;
  } | null;
  studentsEnrolled: number;
}

/** GET /api/users/me/arrival-recommendation?date=YYYY-MM-DD */
export interface ArrivalClassSummary {
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
}

export interface ArrivalTimingBreakdown {
  walkMinutesFromLotToBuilding: number;
  inBuildingNavigationMinutes: number;
  lotCongestionBufferMinutes: number;
  prepBufferMinutes: number;
  totalTravelMinutes: number;
  recommendedArriveBy: string;
}

/** Moncton `apply-scenario` clock for this parking step (matches BE). */
export interface OccupancyScenarioClock {
  dateYmd: string;
  timeHHmm: string;
}

export type DayArrivalSegment =
  | {
      type: "initial_arrival";
      targetClass: ArrivalClassSummary;
      building: { id: string; name: string; code: string | null };
      parking: {
        lot: ParkingLot;
        spot: ParkingSpot;
        distanceMeters: number;
        freeSpotsInSelectedLot: number;
        occupancyPercent: number;
      };
      timing: ArrivalTimingBreakdown;
      occupancyScenario: OccupancyScenarioClock;
    }
  | {
      type: "stay_on_campus";
      gapMinutes: number;
      previousClass: ArrivalClassSummary;
      nextClass: ArrivalClassSummary;
      previousEndsAt: string;
      nextStartsAt: string;
    }
  | {
      type: "return_and_park";
      gapAfterPreviousClassMinutes: number;
      targetClass: ArrivalClassSummary;
      building: { id: string; name: string; code: string | null };
      parking: {
        lot: ParkingLot;
        spot: ParkingSpot;
        distanceMeters: number;
        freeSpotsInSelectedLot: number;
        occupancyPercent: number;
      };
      timing: ArrivalTimingBreakdown;
      occupancyScenario: OccupancyScenarioClock;
    };

/** POST /api/parking-lots/recommendation */
export interface BuildingParkingRecommendationResponse {
  lot: ParkingLot;
  spot: ParkingSpot;
  distanceMeters: number;
  freeSpotsInSelectedLot: number;
  occupancyPercent: number;
  evaluatedMode: "current" | "predicted";
}

export interface DayArrivalPlanResponse {
  selectedDate: string;
  /** Catalog term codes used for this plan (e.g. Winter 2026 as `2026/WI`). */
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
  predictionMode: "current" | "predicted";
  eventSize: EventSize;
  /** ISO timestamp when predictions were computed; null in current mode. */
  forecastedAt: string | null;
  /** Minutes from now to the earliest recommended arrival; null in current mode. */
  forecastHorizonMinutes: number | null;
}

export type EventSize = "none" | "small" | "medium" | "large";

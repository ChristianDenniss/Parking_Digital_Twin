export interface ParkingLot {
  id: string;
  name: string;
  campus: string;
  capacity: number;

  latitude?: number;
  longitude?: number;

  category?:
    | "general"
    | "resident"
    | "staff"
    | "phd"
    | "timed"
    | "accessible"
    | "tbd";

  sectionName?: string;

  predictedFreeSpots?: number;
  predictedOccupancyPercent?: number;

  imageUrl: string | null;
  createdAt: string;
}
/** Lot with distance and occupancy when requested with ?buildingId= (for "where to park" optimization). */
export interface ParkingLotWithDistance extends ParkingLot {
  distanceMeters?: number;
  freeSpots?: number;
  occupancyPercent?: number;
}

export interface Building {
  id: string;
  name: string;
  code: string | null;
  floors: number | null;

  latitude?: number;
  longitude?: number;

  createdAt?: string;
}

/** Relationship table: lot ↔ building with distance in meters. */
export interface LotBuildingDistance {
  parkingLotId: string;
  buildingId: string;

  distanceMeters: number;

  walkingTimeMinutes?: number;

  pathPolyline?: string;

  parkingLot?: ParkingLot;
  building?: Building;
}

export interface ParkingSpot {
  id: string;
  parkingLotId: string;

  label: string;
  section: string;
  row: string;
  index: number;

  slotIndex?: number | null;

  category?: "general" | "accessible" | "staff" | "resident";

  predictedFreeSoon?: boolean;

  walkingDistanceToExitMeters?: number;

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

export interface AuthResponse {
  user: { id: string; email: string; name: string | null; createdAt: string };
  token: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
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
export type PredictionMode =
  | "live"
  | "weekday"
  | "weekend"
  | "small_event"
  | "medium_event"
  | "large_event";
export interface WhatIfScenarioRequest {
  arrivalTime: string;
  buildingId: string;

  predictionMode: PredictionMode;

  resident?: boolean;
  disabled?: boolean;

  preferClosest?: boolean;
  preferAvailability?: boolean;
}

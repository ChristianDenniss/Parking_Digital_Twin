// ─── Shared prediction types ──────────────────────────────────────────────────

export type LotType = "general" | "staff" | "resident" | "timed" | "phd";

export type EventSize = "none" | "small" | "medium" | "large";

/** "data" = averaged from ≥3 historical DB samples; "curve" = curve fallback */
export type PredictionConfidence = "data" | "curve";

export interface PredictionResult {
  lotId: string;
  lotName: string;
  lotType: LotType;
  /** 0–100 */
  predictedOccupancyPct: number;
  predictedFreeSpots: number;
  confidence: PredictionConfidence;
  /** ISO – the moment being predicted */
  targetAt: string;
  /** ISO – when this prediction was computed */
  forecastedAt: string;
  event: { size: EventSize; appliedBoost: number };
  enrollment: { applied: boolean; activityIndex: number; multiplier: number };
}

export interface DayProfileHour {
  hour: number;
  predictedOccupancyPct: number;
  confidence: PredictionConfidence;
}

export interface DayProfileResult {
  lotId: string;
  lotName: string;
  date: string;
  hours: DayProfileHour[];
}

export interface PredictionOptions {
  eventSize?: EventSize;
  useEnrollment?: boolean;
  termCodes?: string[];
}

export interface SemesterPeriod {
  name: "pre_semester" | "classes" | "reading_week" | "exams" | "holiday" | "summer";
}

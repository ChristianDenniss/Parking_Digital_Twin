/**
 * Lot access is derived from seeded lot names (StaffParking*, ResidentParking*, PHDParking*, etc.).
 * There is no separate `lotType` column on parking_lots.
 */

export type UserParkingEligibility = {
  role: "staff" | "student" | "phd_candidate";
  resident: boolean;
  disabled: boolean;
};

export type LotAccessRestriction = "staff_only" | "resident_only" | "phd_only" | "none";

/** Default when calling recommendation APIs without a logged-in user (conservative). */
export const DEFAULT_ANONYMOUS_PARKING_ELIGIBILITY: UserParkingEligibility = {
  role: "student",
  resident: false,
  disabled: false,
};

/**
 * Classify restricted lots from naming convention used in seed + GEE.
 */
export function getLotAccessRestriction(lotName: string): LotAccessRestriction {
  const n = lotName.trim();
  if (!n) return "none";
  const compact = n.replace(/\s+/g, "").toUpperCase();
  if (compact.startsWith("STAFFPARKING") || compact.startsWith("STAFF_PARKING")) {
    return "staff_only";
  }
  if (compact.startsWith("RESIDENTPARKING") || compact.startsWith("RESIDENT_PARKING")) {
    return "resident_only";
  }
  if (compact.startsWith("PHDPARKING") || compact.startsWith("PHD_PARKING")) {
    return "phd_only";
  }
  return "none";
}

/**
 * Whether this user may be recommended this lot (General*, Timed*, TBD, etc. = any eligible driver).
 */
export function isUserEligibleForLot(lotName: string, user: UserParkingEligibility): boolean {
  const restriction = getLotAccessRestriction(lotName);
  switch (restriction) {
    case "staff_only":
      return user.role === "staff";
    case "resident_only":
      return user.resident === true;
    case "phd_only":
      return user.role === "phd_candidate";
    default:
      return true;
  }
}

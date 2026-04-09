/**
 * Unit tests for parking lot eligibility logic — no DB required.
 */
import {
  getLotAccessRestriction,
  isUserEligibleForLot,
  type UserParkingEligibility,
} from "../modules/parkingLots/parkingLotEligibility";

const student: UserParkingEligibility = { role: "student", resident: false, disabled: false };
const staff: UserParkingEligibility = { role: "staff", resident: false, disabled: false };
const resident: UserParkingEligibility = { role: "student", resident: true, disabled: false };
const phd: UserParkingEligibility = { role: "phd_candidate", resident: false, disabled: false };
const disabled: UserParkingEligibility = { role: "student", resident: false, disabled: true };

// ─── getLotAccessRestriction ──────────────────────────────────────────────────

describe("getLotAccessRestriction", () => {
  it("detects StaffParking lots", () => {
    expect(getLotAccessRestriction("StaffParking1")).toBe("staff_only");
    expect(getLotAccessRestriction("StaffParking2")).toBe("staff_only");
  });

  it("detects ResidentParking lots", () => {
    expect(getLotAccessRestriction("ResidentParking1")).toBe("resident_only");
  });

  it("detects PHDParking lots", () => {
    expect(getLotAccessRestriction("PHDParking1")).toBe("phd_only");
  });

  it("returns 'none' for general lots", () => {
    expect(getLotAccessRestriction("GeneralParking1")).toBe("none");
    expect(getLotAccessRestriction("TimedParking1")).toBe("none");
    expect(getLotAccessRestriction("TBD")).toBe("none");
  });
});

// ─── isUserEligibleForLot ─────────────────────────────────────────────────────

describe("isUserEligibleForLot", () => {
  it("allows only staff into staff lots", () => {
    expect(isUserEligibleForLot("StaffParking1", staff)).toBe(true);
    expect(isUserEligibleForLot("StaffParking1", student)).toBe(false);
    expect(isUserEligibleForLot("StaffParking1", phd)).toBe(false);
  });

  it("allows only residents into resident lots", () => {
    expect(isUserEligibleForLot("ResidentParking1", resident)).toBe(true);
    expect(isUserEligibleForLot("ResidentParking1", student)).toBe(false);
    expect(isUserEligibleForLot("ResidentParking1", staff)).toBe(false);
  });

  it("allows only PhD candidates into PhD lots", () => {
    expect(isUserEligibleForLot("PHDParking1", phd)).toBe(true);
    expect(isUserEligibleForLot("PHDParking1", student)).toBe(false);
    expect(isUserEligibleForLot("PHDParking1", staff)).toBe(false);
  });

  it("allows everyone into general / timed lots", () => {
    expect(isUserEligibleForLot("GeneralParking1", student)).toBe(true);
    expect(isUserEligibleForLot("GeneralParking1", staff)).toBe(true);
    expect(isUserEligibleForLot("GeneralParking1", phd)).toBe(true);
    expect(isUserEligibleForLot("GeneralParking1", disabled)).toBe(true);
  });

  it("allows all users into TBD lots", () => {
    expect(isUserEligibleForLot("TBD", student)).toBe(true);
  });
});

/**
 * Unit tests for pure utility functions in arrivalRecommendation.service.ts.
 * No DB or network calls — all imported functions are deterministic.
 */

// Mock every module that touches TypeORM / DB so the import resolves cleanly
jest.mock("../db/data-source", () => ({ AppDataSource: { getRepository: jest.fn() } }));
jest.mock("../modules/students/student.service", () => ({}));
jest.mock("../modules/classSchedule/classSchedule.service", () => ({}));
jest.mock("../modules/buildings/building.service", () => ({}));
jest.mock("../modules/parkingLots/parkingLot.service", () => ({}));
jest.mock("../modules/parkingSpots/parkingOccupancyAssign.service", () => ({}));
jest.mock("../modules/prediction/prediction.service", () => ({}));
jest.mock("../modules/users/user.service", () => ({}));

import {
  parseLocalDateFromYyyyMmDd,
  formatLocalYyyyMmDd,
  inferFloorFromRoom,
  getMeetingDaysFromSectionCode,
  courseMeetsOnDay,
} from "../modules/users/arrivalRecommendation.service";
import type { Course } from "../modules/classes/course.entity";

// ─── parseLocalDateFromYyyyMmDd ───────────────────────────────────────────────

describe("parseLocalDateFromYyyyMmDd", () => {
  it("returns a Date at local midnight for a valid YYYY-MM-DD string", () => {
    const d = parseLocalDateFromYyyyMmDd("2026-03-24");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // 0-based → March
    expect(d!.getDate()).toBe(24);
    expect(d!.getHours()).toBe(0);
    expect(d!.getMinutes()).toBe(0);
  });

  it("returns null for an invalid date string", () => {
    expect(parseLocalDateFromYyyyMmDd("not-a-date")).toBeNull();
    expect(parseLocalDateFromYyyyMmDd("2026-13-01")).toBeNull();
    expect(parseLocalDateFromYyyyMmDd("")).toBeNull();
  });

  it("returns null for an impossible calendar date", () => {
    expect(parseLocalDateFromYyyyMmDd("2026-02-30")).toBeNull();
  });
});

// ─── formatLocalYyyyMmDd ──────────────────────────────────────────────────────

describe("formatLocalYyyyMmDd", () => {
  it("formats a Date as YYYY-MM-DD in local time", () => {
    const d = new Date(2026, 2, 24); // March 24 2026 local midnight
    expect(formatLocalYyyyMmDd(d)).toBe("2026-03-24");
  });

  it("zero-pads month and day below 10", () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026
    expect(formatLocalYyyyMmDd(d)).toBe("2026-01-05");
  });
});

// ─── inferFloorFromRoom ────────────────────────────────────────────────────────

describe("inferFloorFromRoom", () => {
  it("returns the leading digit of a 3+ digit room number as the floor", () => {
    expect(inferFloorFromRoom("207")).toBe(2);
    expect(inferFloorFromRoom("313")).toBe(3);
    expect(inferFloorFromRoom("101")).toBe(1);
  });

  it("returns 1 for ground-floor 2-digit rooms", () => {
    expect(inferFloorFromRoom("05")).toBe(1); // leading digit < 1 edge case → falls back
  });

  it("returns 1 when room is null or empty", () => {
    expect(inferFloorFromRoom(null)).toBe(1);
    expect(inferFloorFromRoom("")).toBe(1);
    expect(inferFloorFromRoom(undefined)).toBe(1);
  });

  it("handles room labels with letters (e.g. A207)", () => {
    expect(inferFloorFromRoom("A207")).toBe(2);
  });
});

// ─── getMeetingDaysFromSectionCode ────────────────────────────────────────────

describe("getMeetingDaysFromSectionCode", () => {
  it("maps letter B to [2, 4] (Tue/Thu)", () => {
    expect(getMeetingDaysFromSectionCode("SJ01B")).toEqual([2, 4]);
  });

  it("maps letter A to [1, 3] (Mon/Wed)", () => {
    expect(getMeetingDaysFromSectionCode("SJ01A")).toEqual([1, 3]);
  });

  it("maps letter C to [1, 3, 5] (Mon/Wed/Fri)", () => {
    expect(getMeetingDaysFromSectionCode("SJ01C")).toEqual([1, 3, 5]);
  });

  it("maps letter F to [5] (Fri only)", () => {
    expect(getMeetingDaysFromSectionCode("SJ01F")).toEqual([5]);
  });

  it("returns null for unknown or missing section code", () => {
    expect(getMeetingDaysFromSectionCode(null)).toBeNull();
    expect(getMeetingDaysFromSectionCode("SJ01Z")).toBeNull();
    expect(getMeetingDaysFromSectionCode("")).toBeNull();
  });
});

// ─── courseMeetsOnDay ─────────────────────────────────────────────────────────

describe("courseMeetsOnDay", () => {
  const makeCourse = (sectionCode: string | null): Course =>
    ({ sectionCode } as Course);

  it("returns true on Tue/Thu (2, 4) for a B-section course", () => {
    const c = makeCourse("SJ01B");
    expect(courseMeetsOnDay(c, 2)).toBe(true); // Tuesday
    expect(courseMeetsOnDay(c, 4)).toBe(true); // Thursday
  });

  it("returns false on Mon/Wed/Fri/Sat/Sun for a B-section course", () => {
    const c = makeCourse("SJ01B");
    [1, 3, 5, 6, 0].forEach((d) => expect(courseMeetsOnDay(c, d)).toBe(false));
  });

  it("excludes weekends (0, 6) for unknown section codes", () => {
    const c = makeCourse("SJ01Z"); // unknown
    expect(courseMeetsOnDay(c, 0)).toBe(false); // Sunday
    expect(courseMeetsOnDay(c, 6)).toBe(false); // Saturday
  });

  it("includes weekdays (1–5) for unknown section codes", () => {
    const c = makeCourse("SJ01Z");
    [1, 2, 3, 4, 5].forEach((d) => expect(courseMeetsOnDay(c, d)).toBe(true));
  });
});

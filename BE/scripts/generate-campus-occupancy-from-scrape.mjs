/**
 * Reads BE/data/scraped-courses.json and BE/data/StaffData.md (referenced in output metadata).
 * Writes: BE/data/pplOnCampusByTime.json
 *
 * Per slot: students in class + 1 instructor/section, non-teaching staff ranges (StaffData.md §5),
 * and estimated cars on campus (StudentData.md §1 exact commuter share + §8 low/high for uncertain inputs).
 *
 * Run from repo root: node BE/scripts/generate-campus-occupancy-from-scrape.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const inputPath = join(root, "data", "scraped-courses.json");
const staffDataMdPath = join(root, "data", "StaffData.md");
const studentDataMdPath = join(root, "data", "StudentData.md");
const outputPath = join(root, "data", "pplOnCampusByTime.json");

/** Flat baseline per slot: visitors / unscheduled activity not from scrape (applied to enroll + staff headcounts, then vehicles). */
const BASE_CAMPUS_HEADCOUNT = 50;

/** BE/data/StudentData.md §1 — 2,019 commuters / 2,319 enrolled; both scenarios use this. */
const COMMUTER_RATE = 2019 / 2319;

/**
 * Low / high from StudentData.md §8. commuterShare is always COMMUTER_RATE (§1); only attendance + mode + carpool size vary.
 */
/** Low/high bracket UNBSJ mode split from UNB CTRL Report 009 (2024 commuter survey) — see BE/data/StudentData.md §3 and §8. */
const STUDENT_VEHICLE_SCENARIOS = {
  low: {
    attendance: 0.75,
    commuterShare: COMMUTER_RATE,
    soloRate: 0.48,
    carpoolRate: 0.1,
    carpoolSize: 2.5,
  },
  high: {
    attendance: 0.85,
    commuterShare: COMMUTER_RATE,
    soloRate: 0.58,
    carpoolRate: 0.15,
    carpoolSize: 2.0,
  },
};

function studentVehiclesFromEnrolledInClass(enrolled) {
  const calc = (s) => {
    const commuters = enrolled * s.attendance * s.commuterShare;
    return commuters * (s.soloRate + s.carpoolRate / s.carpoolSize);
  };
  const low = calc(STUDENT_VEHICLE_SCENARIOS.low);
  const high = calc(STUDENT_VEHICLE_SCENARIOS.high);
  return {
    min: Math.round(low),
    max: Math.round(Math.max(high, low)),
  };
}

function instructorVehiclesLowHigh(instructorCount) {
  return {
    min: Math.round(instructorCount * 0.74),
    max: Math.round(instructorCount * 0.94),
  };
}

function staffVehiclesLowHigh(staffMin, staffMax) {
  return {
    min: Math.round(staffMin * 0.68),
    max: Math.round(staffMax * 0.92),
  };
}

/**
 * Non-teaching staff on campus — must match BE/data/StaffData.md §5 table (24h partition).
 */
function nonTeachingStaffRangeForSlotStartMin(m) {
  if (m < 6 * 60) return { min: 30, max: 80, staffDataBlock: "12:00 AM–6:00 AM" };
  if (m < 8 * 60) return { min: 200, max: 400, staffDataBlock: "6:00 AM–8:00 AM" };
  if (m < 10 * 60) return { min: 350, max: 550, staffDataBlock: "8:00 AM–10:00 AM" };
  if (m < 15 * 60) return { min: 500, max: 650, staffDataBlock: "10:00 AM–3:00 PM" };
  if (m < 18 * 60) return { min: 350, max: 500, staffDataBlock: "3:00 PM–6:00 PM" };
  if (m < 22 * 60) return { min: 100, max: 250, staffDataBlock: "6:00 PM–10:00 PM" };
  return { min: 30, max: 80, staffDataBlock: "10:00 PM–12:00 AM" };
}

function normalizeClock(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (min < 0 || min > 59) return null;
  if (h < 0 || h > 24) return null;
  if (h === 24 && min !== 0) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function toMinutesSinceMidnight(clock) {
  const [hs, ms] = clock.split(":");
  const h = parseInt(hs, 10);
  const m = parseInt(ms, 10);
  if (h === 24 && m === 0) return 24 * 60;
  return h * 60 + m;
}

function hasPlausibleMeetingTimes(startTime, endTime) {
  const s = normalizeClock(startTime);
  const e = normalizeClock(endTime);
  if (!s || !e) return false;
  if (s === e) return false;
  const sm = toMinutesSinceMidnight(s);
  const em = toMinutesSinceMidnight(e);
  if (sm == null || em == null) return false;
  if (em <= sm) return false;
  const durationMin = em - sm;
  if (s === "00:00" && e === "23:59") return false;
  if (durationMin > 14 * 60) return false;
  return true;
}

/** Half-open [startMin, endMin): class occupies startMin .. endMin-1 */
function courseWindowMinutes(startTime, endTime) {
  const s = normalizeClock(startTime);
  const e = normalizeClock(endTime);
  if (!s || !e) return null;
  const sm = toMinutesSinceMidnight(s);
  const em = toMinutesSinceMidnight(e);
  if (sm == null || em == null || em <= sm) return null;
  return { startMin: sm, endMin: em };
}

function overlapsHalfOpen(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

function formatClock(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One calendar day in minutes: [0, 24*60), slots are half-open [slotStart, slotEnd). */
function buildSeries(courses, slotMinutes) {
  const DAY_START = 0;
  const DAY_END = 24 * 60;
  const windows = [];
  for (let t = DAY_START; t < DAY_END; t += slotMinutes) {
    windows.push({ slotStart: t, slotEnd: t + slotMinutes });
  }

  let sectionsWithFallbackWindow = 0;
  const intervals = [];

  for (const c of courses) {
    const n = Number(c.enrolled);
    const enrolled = Number.isFinite(n) && n >= 0 ? n : 0;
    if (hasPlausibleMeetingTimes(c.startTime, c.endTime)) {
      const w = courseWindowMinutes(c.startTime, c.endTime);
      if (w) {
        intervals.push({
          startMin: w.startMin,
          endMin: w.endMin,
          enrolled,
          classCode: c.classCode,
        });
        continue;
      }
    }
    sectionsWithFallbackWindow += 1;
  }

  const slots = windows.map(({ slotStart, slotEnd }) => {
    let totalEnrolledInClass = 0;
    let sectionsMeeting = 0;
    for (const iv of intervals) {
      if (overlapsHalfOpen(iv.startMin, iv.endMin, slotStart, slotEnd)) {
        totalEnrolledInClass += iv.enrolled;
        sectionsMeeting += 1;
      }
    }

    totalEnrolledInClass += BASE_CAMPUS_HEADCOUNT;
    const assumedInstructors = sectionsMeeting;
    const totalEnrolledPlusInstructors = totalEnrolledInClass + assumedInstructors;
    const staff = nonTeachingStaffRangeForSlotStartMin(slotStart);
    const staffMin = staff.min + BASE_CAMPUS_HEADCOUNT;
    const staffMax = staff.max + BASE_CAMPUS_HEADCOUNT;
    const totalWithNonTeachingStaffMin = totalEnrolledPlusInstructors + staffMin;
    const totalWithNonTeachingStaffMax = totalEnrolledPlusInstructors + staffMax;

    const carsStudents = studentVehiclesFromEnrolledInClass(totalEnrolledInClass);
    const carsInstructors = instructorVehiclesLowHigh(assumedInstructors);
    const carsStaff = staffVehiclesLowHigh(staffMin, staffMax);
    const carsOnCampusMin =
      carsStudents.min + carsInstructors.min + carsStaff.min;
    const carsOnCampusMax =
      carsStudents.max + carsInstructors.max + carsStaff.max;
    const carsOnCampusMidpoint = (carsOnCampusMin + carsOnCampusMax) / 2;

    return {
      slotStart: formatClock(slotStart),
      slotEnd: formatClock(slotEnd),
      totalEnrolledInClass,
      sectionsMeeting,
      assumedInstructors,
      totalEnrolledPlusInstructors,
      nonTeachingStaffOnCampusMin: staffMin,
      nonTeachingStaffOnCampusMax: staffMax,
      staffDataTimeBlock: staff.staffDataBlock,
      totalClassroomPlusStaffMin: totalWithNonTeachingStaffMin,
      totalClassroomPlusStaffMax: totalWithNonTeachingStaffMax,
      carsFromStudentsMin: carsStudents.min,
      carsFromStudentsMax: carsStudents.max,
      carsFromInstructorsMin: carsInstructors.min,
      carsFromInstructorsMax: carsInstructors.max,
      carsFromNonTeachingStaffMin: carsStaff.min,
      carsFromNonTeachingStaffMax: carsStaff.max,
      carsOnCampusMin,
      carsOnCampusMax,
      carsOnCampusMidpoint: Math.round(carsOnCampusMidpoint * 10) / 10,
    };
  });

  let peak = slots[0];
  for (const s of slots) {
    if (s.totalEnrolledPlusInstructors > peak.totalEnrolledPlusInstructors)
      peak = s;
  }
  let peakIncludingStaffMid = slots[0];
  const midOf = (s) =>
    s.totalEnrolledPlusInstructors +
    (s.nonTeachingStaffOnCampusMin + s.nonTeachingStaffOnCampusMax) / 2;
  for (const s of slots) {
    if (midOf(s) > midOf(peakIncludingStaffMid)) peakIncludingStaffMid = s;
  }

  let peakCars = slots[0];
  for (const s of slots) {
    if (s.carsOnCampusMidpoint > peakCars.carsOnCampusMidpoint) peakCars = s;
  }

  return {
    slots,
    peak,
    peakByClassroomPlusStaffMidpoint: {
      ...peakIncludingStaffMid,
      midpointNonTeachingStaff:
        (peakIncludingStaffMid.nonTeachingStaffOnCampusMin +
          peakIncludingStaffMid.nonTeachingStaffOnCampusMax) /
        2,
      totalClassroomPlusStaffMidpoint:
        peakIncludingStaffMid.totalEnrolledPlusInstructors +
        (peakIncludingStaffMid.nonTeachingStaffOnCampusMin +
          peakIncludingStaffMid.nonTeachingStaffOnCampusMax) /
          2,
    },
    peakCarsOnCampus: {
      slotStart: peakCars.slotStart,
      slotEnd: peakCars.slotEnd,
      carsOnCampusMin: peakCars.carsOnCampusMin,
      carsOnCampusMax: peakCars.carsOnCampusMax,
      carsOnCampusMidpoint: peakCars.carsOnCampusMidpoint,
    },
    sectionCount: courses.length,
    sectionsInOccupancyProfile: intervals.length,
    sectionsWithFallbackWindow,
  };
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("Expected array in scraped-courses.json");

const plausible = raw.filter((c) => hasPlausibleMeetingTimes(c.startTime, c.endTime));
const wi2026 = raw.filter((c) => c.term === "2026/WI");

let staffDataMdPresent = false;
try {
  readFileSync(staffDataMdPath, "utf8");
  staffDataMdPresent = true;
} catch {
  /* optional file */
}

let studentDataMdPresent = false;
try {
  readFileSync(studentDataMdPath, "utf8");
  studentDataMdPresent = true;
} catch {
  /* optional file */
}

const SLOT_MIN = 15;

const out = {
  generatedAt: new Date().toISOString(),
  sourceFile: "scraped-courses.json",
  campusBaselineHeadcountPerSlot: BASE_CAMPUS_HEADCOUNT,
  campusBaselineNote:
    "Added to totalEnrolledInClass and to nonTeachingStaff Min/Max per slot before vehicle estimates and classroom+staff totals.",
  staffPresenceModel: {
    documentationFile: "BE/data/StaffData.md",
    filePresentAtGenerate: staffDataMdPresent,
    description:
      "Non-teaching UNBSJ staff on campus by time block (ranges). Teaching staff in classrooms are already counted as assumedInstructors. See StaffData.md for full methodology (totals, hybrid %, overnight breakdown).",
    slotStaffMapping:
      "Each slot uses nonTeachingStaffRangeForSlotStartMin(slotStart); boundaries match StaffData.md §5 (7 rows, full 24h, half-open by slot start).",
  },
  parkingVehicleModel: {
    documentationFile: "BE/data/StudentData.md",
    filePresentAtGenerate: studentDataMdPresent,
    studentMethod:
      "From totalEnrolledInClass: commuters = enrolled × attendance × (2019/2319) always; attendance/solo/carpool/carpool_size use §8 low/high endpoints (StudentData.md).",
    instructorMethod:
      "assumedInstructors × 0.74–0.94 vehicles (NB auto-oriented workforce prior; StaffData.md).",
    nonTeachingStaffMethod:
      "nonTeachingStaffOnCampusMin/Max × 0.68–0.92 vehicles (NB journey-to-work prior; StaffData.md).",
    caveats:
      "Same-person double-count possible across classroom vs staff series. totalEnrolledInClass double-counts students in multiple overlapping sections → may overstate cars. Not students on campus outside class (library, etc.).",
  },
  slotLengthMinutes: SLOT_MIN,
  dayWindowLocal: { firstSlotStart: "00:00", lastSlotEnd: "24:00" },
  fallbackClassDayWindowLocal: {
    description:
      "Sections without plausible scrape times are omitted from schedule overlap (see sectionsWithFallbackWindow). They do not contribute to totalEnrolledInClass.",
    firstMinuteInclusive: null,
    lastMinuteExclusive: null,
  },
  interpretation: {
    totalEnrolledInClass:
      "Sum of `enrolled` for overlapping plausible sections, plus `campusBaselineHeadcountPerSlot` (default 50). Implausible-time sections are excluded.",
    assumedInstructors:
      "Each section that overlaps the slot adds exactly one assumed instructor (professor/lecturer). `assumedInstructors` equals `sectionsMeeting`; `totalEnrolledPlusInstructors` is students plus those instructors only.",
    nonTeachingStaff:
      "Staff ranges from StaffData.md §5, each increased by `campusBaselineHeadcountPerSlot`. `totalClassroomPlusStaff*` uses those adjusted ranges.",
    plausibleVsFallback:
      "Plausible sections use parsed [startTime, endTime). Implausible or missing times are omitted from the profile (not spread across the day).",
    scheduleGranularity:
      "Scrape times are weekly patterns (no separate Mon vs Tue); this series is one 24-hour profile for a typical weekday-style meeting pattern.",
    carsOnCampus:
      "Student/instructor/staff vehicle bands computed from headcounts that already include `campusBaselineHeadcountPerSlot` on class and staff sides. `carsOnCampusMidpoint` is the average of Min/Max.",
  },
  winter2026: {
    term: "2026/WI",
    coursesIncluded: wi2026.length,
    ...buildSeries(wi2026, SLOT_MIN),
  },
  allTerms: {
    description: "Every row in the scrape (all terms)",
    coursesIncluded: raw.length,
    ...buildSeries(raw, SLOT_MIN),
  },
  counts: {
    totalRowsInScrape: raw.length,
    plausibleTimeRows: plausible.length,
    implausibleOrMissingTimeRows: raw.length - plausible.length,
    winter2026Rows: wi2026.length,
  },
};

const json = JSON.stringify(out, null, 2);
writeFileSync(outputPath, json, "utf8");
console.log(`Wrote ${outputPath}`);
console.log(
  `Winter 2026 peak: ${out.winter2026.peak.slotStart}-${out.winter2026.peak.slotEnd} students+instructors=${out.winter2026.peak.totalEnrolledPlusInstructors} (enrolled=${out.winter2026.peak.totalEnrolledInClass}, instructors=${out.winter2026.peak.assumedInstructors})`
);
console.log(
  `Winter 2026 peak cars: ${out.winter2026.peakCarsOnCampus.slotStart}-${out.winter2026.peakCarsOnCampus.slotEnd} range ${out.winter2026.peakCarsOnCampus.carsOnCampusMin}–${out.winter2026.peakCarsOnCampus.carsOnCampusMax} (mid ${out.winter2026.peakCarsOnCampus.carsOnCampusMidpoint})`
);

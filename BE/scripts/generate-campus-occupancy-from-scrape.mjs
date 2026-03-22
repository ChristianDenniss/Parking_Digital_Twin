/**
 * Reads BE/data/scraped-courses.json and BE/data/StaffData.md (referenced in output metadata).
 * Writes: BE/data/pplOnCampusByTime.json
 *
 * Per slot: students in class + 1 instructor/section, non-teaching staff ranges (StaffData.md §5),
 * and estimated cars on campus (StudentData.md §2–5 + staff drive factors).
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

/**
 * Low / high vehicle scenarios from BE/data/StudentData.md §2–5 (commuter mode + carpool).
 * vehicles = commuters * (solo_rate + carpool_rate / carpool_size); commuters = enrolled * attendance * commuter_share.
 */
const STUDENT_VEHICLE_SCENARIOS = {
  low: {
    attendance: 0.75,
    commuterShare: 0.7,
    soloRate: 0.75,
    carpoolRate: 0.05,
    carpoolSize: 2.5,
  },
  high: {
    attendance: 0.85,
    commuterShare: 0.8,
    soloRate: 0.85,
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

/** Instructors teaching this slot: high solo-drive share (no separate doc table). */
function instructorVehiclesLowHigh(instructorCount) {
  return {
    min: Math.round(instructorCount * 0.72),
    max: Math.round(instructorCount * 0.93),
  };
}

/** Non-teaching staff on campus: not all drive; band ~58–88% bring a car. */
function staffVehiclesLowHigh(staffMin, staffMax) {
  return {
    min: Math.round(staffMin * 0.58),
    max: Math.round(staffMax * 0.88),
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

/** When times are missing or implausible, spread that section across this window (half-open). */
const FALLBACK_CLASS_DAY_START_MIN = 6 * 60; // 06:00
const FALLBACK_CLASS_DAY_END_MIN = 22 * 60; // 22:00 (10pm), exclusive end

function resolveSectionWindow(startTime, endTime) {
  if (hasPlausibleMeetingTimes(startTime, endTime)) {
    const w = courseWindowMinutes(startTime, endTime);
    if (w) return { ...w, usedFallbackWindow: false };
  }
  return {
    startMin: FALLBACK_CLASS_DAY_START_MIN,
    endMin: FALLBACK_CLASS_DAY_END_MIN,
    usedFallbackWindow: true,
  };
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
    const w = resolveSectionWindow(c.startTime, c.endTime);
    if (w.usedFallbackWindow) sectionsWithFallbackWindow += 1;
    const n = Number(c.enrolled);
    const enrolled = Number.isFinite(n) && n >= 0 ? n : 0;
    intervals.push({
      startMin: w.startMin,
      endMin: w.endMin,
      enrolled,
      classCode: c.classCode,
    });
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
    const assumedInstructors = sectionsMeeting; // +1 per section taught this slot
    const totalEnrolledPlusInstructors =
      totalEnrolledInClass + assumedInstructors;
    const staff = nonTeachingStaffRangeForSlotStartMin(slotStart);
    const totalWithNonTeachingStaffMin =
      totalEnrolledPlusInstructors + staff.min;
    const totalWithNonTeachingStaffMax =
      totalEnrolledPlusInstructors + staff.max;

    const carsStudents = studentVehiclesFromEnrolledInClass(totalEnrolledInClass);
    const carsInstructors = instructorVehiclesLowHigh(assumedInstructors);
    const carsStaff = staffVehiclesLowHigh(staff.min, staff.max);
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
      nonTeachingStaffOnCampusMin: staff.min,
      nonTeachingStaffOnCampusMax: staff.max,
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
    sectionCount: intervals.length,
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
      "From totalEnrolledInClass: commuters = enrolled × attendance × commuter_share; vehicles = commuters × (solo_rate + carpool_rate / carpool_size). Low/high scenarios use §2–§5 range endpoints (see StudentData.md §8).",
    instructorMethod:
      "assumedInstructors × 0.72–0.93 vehicles (solo-heavy; approximate band).",
    nonTeachingStaffMethod:
      "nonTeachingStaffOnCampusMin/Max × 0.58–0.88 vehicles (some transit/carpool/not driving).",
    caveats:
      "Same-person double-count possible across classroom vs staff series. totalEnrolledInClass double-counts students in multiple overlapping sections → may overstate cars. Not students on campus outside class (library, etc.).",
  },
  slotLengthMinutes: SLOT_MIN,
  dayWindowLocal: { firstSlotStart: "00:00", lastSlotEnd: "24:00" },
  fallbackClassDayWindowLocal: {
    description:
      "Sections without plausible scrape times are treated as meeting continuously from 06:00 through 22:00 (exclusive of 22:00); no enrollment is assigned to slots before 6am or from 10pm onward for those sections.",
    firstMinuteInclusive: "06:00",
    lastMinuteExclusive: "22:00",
  },
  interpretation: {
    totalEnrolledInClass:
      "For each time slot, sum of `enrolled` for every course section whose meeting interval overlaps the slot. Same person in two simultaneous sections is counted twice; we only have per-section enrollments.",
    assumedInstructors:
      "Each section that overlaps the slot adds exactly one assumed instructor (professor/lecturer). `assumedInstructors` equals `sectionsMeeting`; `totalEnrolledPlusInstructors` is students plus those instructors only.",
    nonTeachingStaff:
      "`nonTeachingStaffOnCampusMin`/`Max` follow BE/data/StaffData.md §5 (admin/support/etc.). `totalClassroomPlusStaffMin`/`Max` = `totalEnrolledPlusInstructors` + that range. Ranges are not additive with unique headcounts—see StaffData.md uncertainty notes.",
    plausibleVsFallback:
      "Plausible sections use parsed [startTime, endTime). Implausible or missing times (placeholders, 0-length, overnight wrap in scrape, >14h, etc.) use a fixed daytime window 06:00–22:00 so their enrollments still appear during expected class hours.",
    scheduleGranularity:
      "Scrape times are weekly patterns (no separate Mon vs Tue); this series is one 24-hour profile for a typical weekday-style meeting pattern.",
    carsOnCampus:
      "`carsOnCampusMin`/`Max` sum student-derived vehicles (StudentData.md), instructor band, and non-teaching staff vehicle band. Breakdown fields `carsFrom*` per group.",
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

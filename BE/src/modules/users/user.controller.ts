import { Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import * as userService from "./user.service";
import * as studentService from "../students/student.service";
import * as classScheduleService from "../classSchedule/classSchedule.service";
import * as arrivalRecommendationService from "./arrivalRecommendation.service";
import * as parkingLotService from "../parkingLots/parkingLot.service";
import * as buildingService from "../buildings/building.service";
import { predictOccupancy } from "../prediction/prediction.service";
import type { EventSize } from "../prediction/prediction.types";
import { createUserSchema, loginSchema, patchMeSchema, updateUserSchema } from "./user.schema";
import type { AuthUser } from "../../middleware/auth";
import { validate } from "../../utils/validate";
import { DEFAULT_ANONYMOUS_PARKING_ELIGIBILITY } from "../parkingLots/parkingLotEligibility";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

/**
 * JWT lifetime for login/register tokens.
 * - Set `JWT_EXPIRES_IN` to seconds as a number (e.g. `2592000` for 30 days), or
 * - a string that `jsonwebtoken` accepts (e.g. `30d`, `12h`, `90d`).
 * Shorter expiry = less risk if a token is stolen; longer = fewer re-logins for demos/school projects.
 */
function jwtExpiresIn(): string | number {
  const fallbackSeconds = 30 * 24 * 60 * 60; // 30 days default (was 7d; felt too aggressive for occasional use)
  const raw = process.env.JWT_EXPIRES_IN?.trim();
  if (!raw) return fallbackSeconds;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return raw;
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  role?: "staff" | "student" | "phd_candidate" | null;
  resident?: boolean | null;
  disabled?: boolean | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    role: (user.role ?? "student") as "staff" | "student" | "phd_candidate",
    resident: Boolean(user.resident),
    disabled: Boolean(user.disabled),
  };
}

export async function register(req: Request, res: Response) {
  const result = validate(createUserSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });

  const existing = await userService.findByEmail(result.data!.email);
  if (existing) return res.status(400).json({ error: "Email already registered" });

  const data = result.data!;
  const user = await userService.create({
    email: data.email,
    password: data.password,
    name: data.name,
    role: data.role,
    resident: data.resident,
    disabled: data.disabled,
  });
  if (data.role === "student" || data.role === "phd_candidate") {
    await studentService.create({
      userId: user.id,
      studentId: data.studentId!.trim(),
      email: user.email,
      name: data.name.trim(),
    });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, {
    expiresIn: jwtExpiresIn() as SignOptions["expiresIn"],
  });
  res.status(201).json({ user: toPublicUser(user), token });
}

export async function login(req: Request, res: Response) {
  const result = validate(loginSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });

  const user = await userService.findByEmail(result.data!.email);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await userService.verifyPassword(user, result.data!.password);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, {
    expiresIn: jwtExpiresIn() as SignOptions["expiresIn"],
  });
  res.json({ user: toPublicUser(user), token });
}

export async function me(req: Request, res: Response) {
  const user = (req as Request & { user?: AuthUser }).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const full = await userService.findById(user.id);
  if (!full) return res.status(404).json({ error: "User not found" });
  res.json({
    ...toPublicUser(full),
    student: full.student
      ? {
          id: full.student.id,
          studentId: full.student.studentId,
          email: full.student.email,
          name: full.student.name,
          year: full.student.year,
        }
      : null,
  });
}

export async function patchMe(req: Request, res: Response) {
  const authUser = (req as Request & { user?: AuthUser }).user;
  if (!authUser) return res.status(401).json({ error: "Not authenticated" });

  const result = validate(patchMeSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const data = result.data!;

  let full = await userService.findById(authUser.id);
  if (!full) return res.status(404).json({ error: "User not found" });

  // Never unlink the student profile on role change (staff, student, or PhD candidate). Schedules are keyed by
  // student id; clearing the link would hide enrollments. Parking still follows `role` + `resident` on the user.

  if (data.email !== undefined) {
    const existing = await userService.findByEmail(data.email);
    if (existing && existing.id !== full.id) {
      return res.status(400).json({ error: "Email already in use" });
    }
  }

  const userPatch: Parameters<typeof userService.update>[1] = {};
  if (data.name !== undefined) userPatch.name = data.name;
  if (data.email !== undefined) userPatch.email = data.email;
  if (data.role !== undefined) userPatch.role = data.role;
  if (data.resident !== undefined) userPatch.resident = data.resident;
  if (data.disabled !== undefined) userPatch.disabled = data.disabled;

  if (Object.keys(userPatch).length > 0) {
    const updated = await userService.update(full.id, userPatch);
    if (!updated) return res.status(404).json({ error: "User not found" });
  }

  full = await userService.findById(authUser.id);
  if (!full) return res.status(404).json({ error: "User not found" });

  const role = full.role ?? "student";
  if ((role === "student" || role === "phd_candidate") && !full.student) {
    const sid = data.studentId?.trim();
    if (!sid) {
      return res.status(400).json({
        error:
          "Student ID is required when your role is Student or PhD candidate and no student profile is linked yet.",
      });
    }
    await studentService.create({
      userId: full.id,
      studentId: sid,
      email: full.email,
      name: (full.name ?? "").trim() || full.email,
    });
    full = await userService.findById(authUser.id);
    if (!full) return res.status(404).json({ error: "User not found" });
  }

  if (full.student && (data.name !== undefined || data.email !== undefined)) {
    await studentService.update(full.student.id, {
      ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    });
    full = await userService.findById(authUser.id);
    if (!full) return res.status(404).json({ error: "User not found" });
  }

  res.json({
    ...toPublicUser(full),
    student: full.student
      ? {
          id: full.student.id,
          studentId: full.student.studentId,
          email: full.student.email,
          name: full.student.name,
          year: full.student.year,
        }
      : null,
  });
}

export async function myArrivalRecommendation(req: Request, res: Response) {
  const user = (req as Request & { user?: AuthUser }).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const dateRaw = req.query.date;
  const dateStr = typeof dateRaw === "string" ? dateRaw.trim() : "";
  if (!dateStr) {
    return res.status(400).json({
      error: "Query parameter `date` is required (YYYY-MM-DD, local calendar day).",
    });
  }
  const selectedDate = arrivalRecommendationService.parseLocalDateFromYyyyMmDd(dateStr);
  if (!selectedDate) {
    return res.status(400).json({ error: "Invalid `date`. Use YYYY-MM-DD." });
  }

  const stateModeRaw = req.query.stateMode;
  const stateMode =
    stateModeRaw === "predicted" ? "predicted" as const : "current" as const;

  const eventSizeRaw = req.query.eventSize;
  const eventSize =
    eventSizeRaw === "small" || eventSizeRaw === "medium" || eventSizeRaw === "large"
      ? eventSizeRaw
      : "none" as const;

  const result = await arrivalRecommendationService.getArrivalRecommendationForUser(user.id, {
    selectedDate,
    stateMode,
    eventSize,
  });
  if (!result) {
    return res.status(404).json({
      error:
        "Could not build a recommendation. You may need a linked student profile, at least one scheduled class with a building and valid start time, a matching campus building, and an available parking lot.",
    });
  }
  res.json(result);
}

/**
 * GET /api/users/me/quick-recommend?buildingId=&mode=current|predicted&eventSize=none
 *
 * Returns a single best parking recommendation for a given building, based on the
 * authenticated user's eligibility (or anonymous defaults for unauthenticated requests).
 * Supports both live ("current") and forecast ("predicted") modes.
 */
/**
 * GET /api/users/me/what-if-personal?date=YYYY-MM-DD&time=HH:MM&eventSize=small
 *
 * Compares baseline vs. scenario parking recommendation for the authenticated user's
 * first class on the selected date. Runs predictive mode for both sides so the
 * comparison is fair (no live vs. forecast mismatch).
 */
export async function myPersonalWhatIf(req: Request, res: Response) {
  const authUser = (req as Request & { user?: AuthUser }).user;
  if (!authUser) return res.status(401).json({ error: "Not authenticated" });

  const dateStr = typeof req.query.date === "string" ? req.query.date.trim() : "";
  if (!dateStr) return res.status(400).json({ error: "Query parameter `date` is required (YYYY-MM-DD)." });
  const selectedDate = arrivalRecommendationService.parseLocalDateFromYyyyMmDd(dateStr);
  if (!selectedDate) return res.status(400).json({ error: "Invalid `date`. Use YYYY-MM-DD." });

  const timeRaw = typeof req.query.time === "string" ? req.query.time.trim() : "";
  const time = timeRaw || `${String(new Date().getHours()).padStart(2, "0")}:00`;

  const eventSizeRaw = req.query.eventSize;
  const eventSize: EventSize =
    eventSizeRaw === "small" || eventSizeRaw === "medium" || eventSizeRaw === "large"
      ? eventSizeRaw
      : "none";

  // Build target datetime for predictions
  const [hourStr, minStr] = time.split(":");
  const targetDatetime = new Date(selectedDate);
  targetDatetime.setHours(Number(hourStr ?? 0), Number(minStr ?? 0), 0, 0);

  // Resolve user eligibility
  const user = await userService.findById(authUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const parkingEligibility = {
    role: (user.role ?? "student") as "staff" | "student" | "phd_candidate",
    resident: Boolean(user.resident),
    disabled: Boolean(user.disabled),
  };

  // Get the user's day plan (lightweight: just need the first building + its ID)
  const plan = await arrivalRecommendationService.getArrivalRecommendationForUser(authUser.id, {
    selectedDate,
    stateMode: "predicted",
    eventSize: "none",
  });

  const firstClassSeg = plan?.segments.find(
    (s) => s.type === "initial_arrival" || s.type === "no_parking_available",
  );
  if (!firstClassSeg) {
    return res.status(404).json({
      error:
        "No class with a building found on this date. Your schedule needs at least one class with a building to run a personal what-if.",
      noClassesOnDay: plan?.noClassesOnDay ?? false,
    });
  }
  const bStr = firstClassSeg.targetClass.building?.trim();
  if (!bStr) {
    return res.status(404).json({
      error:
        "No building on the first class for this date. Add a building to the course to run a personal what-if.",
      noClassesOnDay: plan?.noClassesOnDay ?? false,
    });
  }
  const resolvedBuilding = await buildingService.findBuildingForCourseBuilding(bStr);
  if (!resolvedBuilding) {
    return res.status(404).json({
      error: "Could not match the class building to a campus building for predictions.",
      noClassesOnDay: plan?.noClassesOnDay ?? false,
    });
  }
  const buildingId = resolvedBuilding.id;

  // Predicted free spots per lot — baseline (no event) and scenario (with event)
  const nearbyLots = await parkingLotService.findRecommendationsByBuilding(buildingId);

  const [baselinePreds, scenarioPreds] = await Promise.all([
    Promise.allSettled(
      nearbyLots.map(async (r) => {
        const pred = await predictOccupancy(r.lot.id, targetDatetime, { eventSize: "none", useEnrollment: true });
        return pred ? { lotId: r.lot.id, freeSpots: pred.predictedFreeSpots, occupancyPct: pred.predictedOccupancyPct, confidence: pred.confidence } : null;
      })
    ),
    Promise.allSettled(
      nearbyLots.map(async (r) => {
        const pred = await predictOccupancy(r.lot.id, targetDatetime, { eventSize, useEnrollment: true });
        return pred ? { lotId: r.lot.id, freeSpots: pred.predictedFreeSpots, occupancyPct: pred.predictedOccupancyPct, confidence: pred.confidence } : null;
      })
    ),
  ]);

  const baselineFreeSpots: Record<string, number> = {};
  const scenarioFreeSpots: Record<string, number> = {};
  for (const r of baselinePreds) {
    if (r.status === "fulfilled" && r.value) baselineFreeSpots[r.value.lotId] = r.value.freeSpots;
  }
  for (const r of scenarioPreds) {
    if (r.status === "fulfilled" && r.value) scenarioFreeSpots[r.value.lotId] = r.value.freeSpots;
  }

  const [baselineRec, scenarioRec] = await Promise.all([
    parkingLotService.recommendBestParking({ buildingId, stateMode: "predicted", parkingEligibility, predictedFreeSpotsByLotId: baselineFreeSpots }),
    parkingLotService.recommendBestParking({ buildingId, stateMode: "predicted", parkingEligibility, predictedFreeSpotsByLotId: scenarioFreeSpots }),
  ]);

  const lotChanged = baselineRec && scenarioRec ? baselineRec.lot.id !== scenarioRec.lot.id : false;
  const scenarioFreeInLot = scenarioRec?.freeSpotsInSelectedLot ?? 0;

  const formatRec = (rec: typeof baselineRec) => {
    if (!rec) return null;
    const occupancyPct = rec.lot.capacity > 0
      ? Math.round(((rec.lot.capacity - rec.freeSpotsInSelectedLot) / rec.lot.capacity) * 100)
      : 0;
    return {
      lot: { id: rec.lot.id, name: rec.lot.name, capacity: rec.lot.capacity },
      spot: {
        id: rec.spot.id,
        label: rec.spot.label,
        isAccessible: rec.spot.isAccessible ?? false,
      },
      distanceMeters: rec.distanceMeters,
      freeSpotsInLot: rec.freeSpotsInSelectedLot,
      occupancyPct,
      walkMinutes: Math.ceil(rec.distanceMeters / 80),
    };
  };

  res.json({
    date: dateStr,
    time,
    eventSize,
    building: { id: resolvedBuilding.id, name: resolvedBuilding.name },
    baseline: formatRec(baselineRec),
    scenario: formatRec(scenarioRec),
    lotChanged,
    spotsDroppedBelow10: scenarioFreeInLot < 10,
  });
}

export async function quickRecommend(req: Request, res: Response) {
  const authUser = (req as Request & { user?: AuthUser }).user;

  const buildingId = typeof req.query.buildingId === "string" ? req.query.buildingId.trim() : "";
  if (!buildingId) {
    return res.status(400).json({ error: "Query parameter `buildingId` is required." });
  }

  const modeRaw = req.query.mode;
  const stateMode: "current" | "predicted" =
    modeRaw === "predicted" ? "predicted" : "current";

  const eventSizeRaw = req.query.eventSize;
  const eventSize: EventSize =
    eventSizeRaw === "small" || eventSizeRaw === "medium" || eventSizeRaw === "large"
      ? eventSizeRaw
      : "none";

  // Build parking eligibility from authenticated user or fall back to anonymous
  let parkingEligibility = DEFAULT_ANONYMOUS_PARKING_ELIGIBILITY;
  if (authUser) {
    const user = await userService.findById(authUser.id);
    if (user) {
      parkingEligibility = {
        role: (user.role ?? "student") as "staff" | "student" | "phd_candidate",
        resident: Boolean(user.resident),
        disabled: Boolean(user.disabled),
      };
    }
  }

  // For predicted mode: get predicted free-spot counts per lot near the building
  let predictedFreeSpotsByLotId: Record<string, number> | undefined;
  if (stateMode === "predicted") {
    const now = new Date();
    const nearbyLots = await parkingLotService.findRecommendationsByBuilding(buildingId);
    const predictions = await Promise.allSettled(
      nearbyLots.map(async (r) => {
        const pred = await predictOccupancy(r.lot.id, now, { eventSize, useEnrollment: true });
        return pred ? { lotId: r.lot.id, freeSpots: pred.predictedFreeSpots } : null;
      })
    );
    predictedFreeSpotsByLotId = {};
    for (const result of predictions) {
      if (result.status === "fulfilled" && result.value) {
        predictedFreeSpotsByLotId[result.value.lotId] = result.value.freeSpots;
      }
    }
  }

  const recommendation = await parkingLotService.recommendBestParking({
    buildingId,
    stateMode,
    parkingEligibility,
    predictedFreeSpotsByLotId,
  });

  if (!recommendation) {
    return res.status(404).json({
      error: "No available parking found near this building for your permit type.",
      authenticated: Boolean(authUser),
    });
  }

  // Estimate walk time: distance / 80 m/min (standard walking speed)
  const walkMinutes = Math.ceil(recommendation.distanceMeters / 80);

  // Occupancy percentage for the selected lot
  const occupancyPct =
    recommendation.lot.capacity > 0
      ? Math.round(
          ((recommendation.lot.capacity - recommendation.freeSpotsInSelectedLot) /
            recommendation.lot.capacity) *
            100
        )
      : 0;

  // Confidence label (predicted mode: data or curve — get from prediction if available)
  let confidence: "live" | "data-backed" | "curve-estimate" = "live";
  if (stateMode === "predicted") {
    const pred = await predictOccupancy(recommendation.lot.id, new Date(), {
      eventSize,
      useEnrollment: true,
    });
    confidence = pred?.confidence === "data" ? "data-backed" : "curve-estimate";
  }

  res.json({
    mode: stateMode,
    eventSize,
    authenticated: Boolean(authUser),
    lot: {
      id: recommendation.lot.id,
      name: recommendation.lot.name,
      campus: recommendation.lot.campus,
      capacity: recommendation.lot.capacity,
    },
    spot: {
      id: recommendation.spot.id,
      label: recommendation.spot.label,
      section: recommendation.spot.section,
      row: recommendation.spot.row,
      index: recommendation.spot.index,
      isAccessible: recommendation.spot.isAccessible ?? false,
    },
    distanceMeters: recommendation.distanceMeters,
    freeSpotsInLot: recommendation.freeSpotsInSelectedLot,
    occupancyPct,
    walkMinutes,
    confidence,
  });
}

export async function mySchedule(req: Request, res: Response) {
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const student = await studentService.findByUserId(user.id);
  if (!student) return res.json([]);
  const schedules = await classScheduleService.findAll({ studentId: student.id }, ["course"]);
  const withDetails = await Promise.all(
    schedules.map(async (s) => {
      const studentsEnrolled = await classScheduleService.countByClassId(s.classId);
      return {
        id: s.id,
        studentId: s.studentId,
        classId: s.classId,
        term: s.term,
        section: s.section,
        createdAt: s.createdAt,
        course: s.course
          ? {
              id: s.course.id,
              classCode: s.course.classCode,
              name: s.course.name,
              startTime: s.course.startTime,
              endTime: s.course.endTime,
              term: s.course.term,
              building: s.course.building,
              room: s.course.room,
              sectionCode: s.course.sectionCode,
              enrolled: s.course.enrolled,
              capacity: s.course.capacity,
            }
          : null,
        studentsEnrolled,
      };
    })
  );
  res.json(withDetails);
}

export async function list(req: Request, res: Response) {
  const users = await userService.findAll();
  res.json(users.map(toPublicUser));
}

export async function getById(req: Request, res: Response) {
  const user = await userService.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(toPublicUser(user));
}

export async function update(req: Request, res: Response) {
  const result = validate(updateUserSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });

  if (result.data!.email !== undefined) {
    const existing = await userService.findByEmail(result.data!.email);
    if (existing && existing.id !== req.params.id)
      return res.status(400).json({ error: "Email already in use" });
  }

  const user = await userService.update(req.params.id, result.data!);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(toPublicUser(user));
}

export async function remove(req: Request, res: Response) {
  const user = await userService.remove(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.status(204).send();
}

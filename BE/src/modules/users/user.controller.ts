import { Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import * as userService from "./user.service";
import * as studentService from "../students/student.service";
import * as classScheduleService from "../classSchedule/classSchedule.service";
import * as arrivalRecommendationService from "./arrivalRecommendation.service";
import { createUserSchema, loginSchema, patchMeSchema, updateUserSchema } from "./user.schema";
import type { AuthUser } from "../../middleware/auth";
import { validate } from "../../utils/validate";

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

  const result = await arrivalRecommendationService.getArrivalRecommendationForUser(user.id, {
    selectedDate,
  });
  if (!result) {
    return res.status(404).json({
      error:
        "Could not build a recommendation. You may need a linked student profile, at least one scheduled class with a building and valid start time, a matching campus building, and an available parking lot.",
    });
  }
  res.json(result);
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

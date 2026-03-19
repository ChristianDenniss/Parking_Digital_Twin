import { Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import * as userService from "./user.service";
import * as studentService from "../students/student.service";
import * as classScheduleService from "../classSchedule/classSchedule.service";
import { createUserSchema, loginSchema, updateUserSchema } from "./user.schema";
import { validate } from "../../utils/validate";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN_SEC = process.env.JWT_EXPIRES_IN
  ? Number(process.env.JWT_EXPIRES_IN)
  : 7 * 24 * 60 * 60; // 7 days in seconds

function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  role: "staff" | "student" | "phd_candidate";
  resident: boolean;
  disabled: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    role: user.role,
    resident: user.resident,
    disabled: user.disabled,
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
    expiresIn: JWT_EXPIRES_IN_SEC,
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
    expiresIn: JWT_EXPIRES_IN_SEC,
  });
  res.json({ user: toPublicUser(user), token });
}

export async function me(req: Request, res: Response) {
  const user = (req as Request & { user?: { id: string; email: string; name: string | null; createdAt: Date } }).user;
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

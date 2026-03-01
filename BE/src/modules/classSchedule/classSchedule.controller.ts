import { Request, Response } from "express";
import * as classScheduleService from "./classSchedule.service";
import { createClassScheduleSchema } from "./classSchedule.schema";
import { validate } from "../../utils/validate";

export async function list(req: Request, res: Response) {
  const studentId = (req.query.studentId as string) || null;
  const classId = (req.query.classId as string) || null;
  const rows = await classScheduleService.findAll({ studentId, classId });
  res.json(rows);
}

export async function getById(req: Request, res: Response) {
  const entry = await classScheduleService.findById(req.params.id);
  if (!entry) return res.status(404).json({ error: "Class schedule entry not found" });
  res.json(entry);
}

export async function create(req: Request, res: Response) {
  const result = validate(createClassScheduleSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const entry = await classScheduleService.create(result.data!);
  res.status(201).json(entry);
}

export async function remove(req: Request, res: Response) {
  const removed = await classScheduleService.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: "Class schedule entry not found" });
  res.status(204).send();
}

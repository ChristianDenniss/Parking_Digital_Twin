import { Request, Response } from "express";
import * as courseService from "./course.service";
import { createCourseSchema } from "./course.schema";
import { validate } from "../../utils/validate";

export async function list(req: Request, res: Response) {
  const list = await courseService.findAll();
  res.json(list);
}

export async function getById(req: Request, res: Response) {
  const course = await courseService.findById(req.params.id);
  if (!course) return res.status(404).json({ error: "Class not found" });
  res.json(course);
}

export async function create(req: Request, res: Response) {
  const result = validate(createCourseSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const course = await courseService.create(result.data!);
  res.status(201).json(course);
}

import { Request, Response } from "express";
import * as studentService from "./student.service";
import { createStudentSchema } from "./student.schema";
import { validate } from "../../utils/validate";

export async function list(req: Request, res: Response) {
  const students = await studentService.findAll();
  res.json(students);
}

export async function getById(req: Request, res: Response) {
  const student = await studentService.findById(req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json(student);
}

export async function create(req: Request, res: Response) {
  const result = validate(createStudentSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const student = await studentService.create(result.data!);
  res.status(201).json(student);
}

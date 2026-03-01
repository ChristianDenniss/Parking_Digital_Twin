import { z } from "zod";

export const createStudentSchema = z.object({
  studentId: z.string().min(1, { message: "studentId is required" }).trim(),
  email: z.string().min(1, { message: "Email is required" }).email("Invalid email").trim(),
  name: z.string().min(1, { message: "Name is required" }).trim(),
  year: z.coerce.number().int().min(1).max(10).optional().nullable(),
}).strict();

export const updateStudentSchema = createStudentSchema.partial();

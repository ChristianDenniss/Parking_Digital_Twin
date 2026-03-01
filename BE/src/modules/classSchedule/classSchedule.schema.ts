import { z } from "zod";

export const createClassScheduleSchema = z.object({
  studentId: z.string().min(1, { message: "studentId is required" }).trim(),
  classId: z.string().min(1, { message: "classId is required" }).trim(),
  term: z.string().trim().optional().nullable(),
  section: z.string().trim().optional().nullable(),
}).strict();

export const updateClassScheduleSchema = createClassScheduleSchema.partial();

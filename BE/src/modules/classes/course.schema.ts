import { z } from "zod";

export const createCourseSchema = z.object({
  classCode: z.string().min(1, { message: "classCode is required" }).trim(),
  startTime: z.string().min(1, { message: "startTime is required" }).trim(),
  endTime: z.string().min(1, { message: "endTime is required" }).trim(),
  name: z.string().trim().optional().nullable(),
  term: z.string().trim().optional().nullable(),
  building: z.string().trim().optional().nullable(),
  room: z.string().trim().optional().nullable(),
}).strict();

export const updateCourseSchema = createCourseSchema.partial();

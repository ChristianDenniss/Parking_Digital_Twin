import { z } from "zod";

export const createParkingLotSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }).trim(),
  capacity: z.coerce.number({ required_error: "Capacity is required", invalid_type_error: "Capacity must be a number" }).int().nonnegative(),
  campus: z.string().trim().optional(),
  imageUrl: z.string().url().trim().optional().nullable(),
}).strict();

export const updateParkingLotSchema = createParkingLotSchema.partial();

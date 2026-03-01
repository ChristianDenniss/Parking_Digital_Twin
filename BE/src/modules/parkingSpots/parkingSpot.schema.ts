import { z } from "zod";

export const createParkingSpotSchema = z.object({
  parkingLotId: z.string().min(1, { message: "parkingLotId is required" }).trim(),
  label: z.string().min(1, { message: "Label is required" }).trim(),
  row: z.string().trim().optional(),
  index: z.coerce.number().int().nonnegative().optional(),
}).strict();

export const updateParkingSpotSchema = createParkingSpotSchema.partial();

export const updateParkingSpotStatusSchema = z.object({
  status: z.enum(["occupied", "empty"], { message: "status must be 'occupied' or 'empty'" }),
}).strict();

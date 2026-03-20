import { z } from "zod";

export const createParkingLotSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }).trim(),
  capacity: z.coerce.number({ required_error: "Capacity is required", invalid_type_error: "Capacity must be a number" }).int().nonnegative(),
  campus: z.string().trim().optional(),
  imageUrl: z.string().url().trim().optional().nullable(),
}).strict();

export const updateParkingLotSchema = createParkingLotSchema.partial();

export const recommendParkingSchema = z.object({
  buildingId: z.string().uuid({ message: "buildingId must be a valid UUID" }),
  stateMode: z.enum(["current", "predicted"]).default("current"),
  // Optional predicted lot-level availability overrides:
  // key = parkingLotId, value = predicted free spot count.
  predictedFreeSpotsByLotId: z.record(z.string().uuid(), z.coerce.number().int().nonnegative()).optional(),
  // Optional predicted spot statuses by lot:
  // key = parkingLotId, value = { spotId: "empty" | "occupied" }.
  predictedSpotStatusByLotId: z
    .record(z.string().uuid(), z.record(z.string().uuid(), z.enum(["empty", "occupied"])))
    .optional(),
}).strict();

import { z } from "zod";

export const createHistoricalSchema = z.object({
  sourceName: z.string().min(1, { message: "sourceName is required" }).trim(),
  occupancyPct: z.coerce.number({ required_error: "occupancyPct is required", invalid_type_error: "occupancyPct must be a number" }).min(0).max(100),
  snapshot: z.record(z.unknown()).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
}).strict();

export const updateHistoricalSchema = createHistoricalSchema.partial();

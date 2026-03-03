import { Router } from "express";
import * as controller from "./parkingSpotLog.controller";
import { cacheMiddleware } from "../../middleware/cache";

const router = Router();

// Cache logs list (optionally filtered by parkingSpotId)
router.get("/", cacheMiddleware({ prefix: "parking-spot-logs", ttlSeconds: 30 }), controller.list);
// Cache individual log lookups
router.get(
  "/:id",
  cacheMiddleware({
    prefix: "parking-spot-logs",
    ttlSeconds: 30,
    key: (req) => `GET:/api/parking-spot-logs/${req.params.id}`,
  }),
  controller.getById
);

export default router;


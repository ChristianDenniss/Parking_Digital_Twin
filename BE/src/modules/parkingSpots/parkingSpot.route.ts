import { Router } from "express";
import * as controller from "./parkingSpot.controller";
import { cacheMiddleware, invalidateCacheMiddleware } from "../../middleware/cache";

const router = Router();

// Cache the list of spots (per query) for a short time
router.get("/", cacheMiddleware({ prefix: "parking-spots", ttlSeconds: 30 }), controller.list);
router.post(
  "/apply-scenario",
  invalidateCacheMiddleware("parking-spots"),
  controller.applyScenario
);
router.post(
  "/apply-live",
  invalidateCacheMiddleware("parking-spots"),
  controller.applyLive
);
// Cache individual spot lookups
router.get(
  "/:id",
  cacheMiddleware({
    prefix: "parking-spots",
    ttlSeconds: 30,
    key: (req) => `GET:/api/parking-spots/${req.params.id}`,
  }),
  controller.getById
);
// Mutations invalidate spot-related cache
router.patch("/:id/status", invalidateCacheMiddleware("parking-spots"), controller.updateStatus);
router.post("/", invalidateCacheMiddleware("parking-spots"), controller.create);

export default router;

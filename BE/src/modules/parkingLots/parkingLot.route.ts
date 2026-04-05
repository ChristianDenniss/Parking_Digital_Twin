import { Router } from "express";
import * as controller from "./parkingLot.controller";
import { cacheMiddleware, invalidateCacheMiddleware } from "../../middleware/cache";
import { optionalAuth } from "../../middleware/auth";

const router = Router();

// Not cached: recommendation depends on live spot occupancy; caching returned stale lots/spots.
router.post("/recommendation", optionalAuth, controller.recommend);
router.get(
  "/forecast",
  cacheMiddleware({ prefix: "parking-lots-forecast", ttlSeconds: 45 }),
  controller.forecast
);
router.get("/", cacheMiddleware({ prefix: "parking-lots", ttlSeconds: 60 }), controller.list);
router.get(
  "/:id",
  cacheMiddleware({
    prefix: "parking-lots",
    ttlSeconds: 60,
    key: (req) => `GET:/api/parking-lots/${req.params.id}`,
  }),
  controller.getById
);
// Cache the per-lot spot listing (key includes section so "all" vs "section=A" don't share cache)
router.get(
  "/:id/spots",
  cacheMiddleware({
    prefix: "parking-lot-spots",
    ttlSeconds: 30,
    key: (req) => `GET:/api/parking-lots/${req.params.id}/spots?section=${(req.query.section as string) ?? ""}`,
  }),
  controller.getSpots
);
router.post("/", invalidateCacheMiddleware("parking-lots"), controller.create);

export default router;

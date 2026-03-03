import { Router } from "express";
import * as controller from "./parkingLot.controller";
import { cacheMiddleware, invalidateCacheMiddleware } from "../../middleware/cache";

const router = Router();

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
// Cache the per-lot spot listing as well (parking spot-related)
router.get(
  "/:id/spots",
  cacheMiddleware({
    prefix: "parking-lot-spots",
    ttlSeconds: 30,
    key: (req) => `GET:/api/parking-lots/${req.params.id}/spots`,
  }),
  controller.getSpots
);
router.post("/", invalidateCacheMiddleware("parking-lots"), controller.create);

export default router;

import { Router } from "express";
import * as buildingController from "./building.controller";
import * as lotBuildingDistanceController from "./lotBuildingDistance.controller";
import { cacheMiddleware, invalidateCacheMiddleware } from "../../middleware/cache";

const CACHE_TTL = 7 * 24 * 60 * 60; // cache max lifetime of 7 days(buildings and distances rarely change)

const router = Router();

router.get(
  "/",
  cacheMiddleware({ prefix: "buildings", ttlSeconds: CACHE_TTL }),
  buildingController.list
);
router.get("/distances/lot-building",
  cacheMiddleware({ prefix: "lot-building-distances", ttlSeconds: CACHE_TTL }),
  lotBuildingDistanceController.list
);
router.post(
  "/distances/lot-building",
  invalidateCacheMiddleware("lot-building-distances"),
  lotBuildingDistanceController.create
);
router.patch(
  "/distances/lot-building",
  invalidateCacheMiddleware("lot-building-distances"),
  lotBuildingDistanceController.update
);
router.delete(
  "/distances/lot-building",
  invalidateCacheMiddleware("lot-building-distances"),
  lotBuildingDistanceController.remove
);

router.get(
  "/:id",
  cacheMiddleware({
    prefix: "buildings",
    ttlSeconds: CACHE_TTL,
    key: (req) => `GET:/api/buildings/${req.params.id}`,
  }),
  buildingController.getById
);
router.patch(
  "/:id",
  invalidateCacheMiddleware("buildings"),
  buildingController.update
);
router.delete(
  "/:id",
  invalidateCacheMiddleware("buildings"),
  invalidateCacheMiddleware("lot-building-distances"),
  buildingController.remove
);
router.post("/", invalidateCacheMiddleware("buildings"), buildingController.create);

export default router;

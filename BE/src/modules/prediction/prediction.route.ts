import { Router } from "express";
import { cacheMiddleware } from "../../middleware/cache";
import {
  predictOne,
  predictDayProfileHandler,
  predictNextHoursHandler,
  predictSnapshotHandler,
} from "./prediction.controller";

const router = Router();
const FIVE_MIN = { ttlSeconds: 300 };

router.get("/snapshot", cacheMiddleware(FIVE_MIN), predictSnapshotHandler);
router.get("/lots/:lotId/day-profile", cacheMiddleware(FIVE_MIN), predictDayProfileHandler);
router.get("/lots/:lotId/next-hours", cacheMiddleware(FIVE_MIN), predictNextHoursHandler);
router.get("/lots/:lotId", cacheMiddleware(FIVE_MIN), predictOne);

export default router;

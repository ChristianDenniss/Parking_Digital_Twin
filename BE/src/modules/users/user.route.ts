import { Router } from "express";
import { asyncHandler } from "../../middleware";
import * as controller from "./user.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();

router.get("/me", requireAuth, controller.me);
router.patch("/me", requireAuth, asyncHandler(controller.patchMe));
router.get("/me/arrival-recommendation", requireAuth, asyncHandler(controller.myArrivalRecommendation));
router.get("/me/schedule", requireAuth, controller.mySchedule);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);

export default router;

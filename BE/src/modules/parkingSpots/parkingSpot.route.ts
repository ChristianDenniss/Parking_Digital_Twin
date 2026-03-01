import { Router } from "express";
import * as controller from "./parkingSpot.controller";

const router = Router();

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id/status", controller.updateStatus);
router.post("/", controller.create);

export default router;

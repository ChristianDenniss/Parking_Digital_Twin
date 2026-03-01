import { Router } from "express";
import * as controller from "./parkingLot.controller";

const router = Router();

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.get("/:id/spots", controller.getSpots);
router.post("/", controller.create);

export default router;

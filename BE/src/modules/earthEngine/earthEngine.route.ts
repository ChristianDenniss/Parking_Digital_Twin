import { Router } from "express";
import * as controller from "./earthEngine.controller";

const router = Router();

router.get("/sections", controller.getSections);
router.get("/tiles", controller.getTileUrl);
router.get("/tiles/:z/:x/:y", controller.getTile);

export default router;

import { Router } from "express";
import * as controller from "./simulator.controller";

const router = Router();

router.get("/", controller.getState);
router.post("/", controller.postState);

export default router;

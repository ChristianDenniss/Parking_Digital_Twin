import { Router } from "express";
import * as controller from "./classSchedule.controller";

const router = Router();

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.delete("/:id", controller.remove);

export default router;

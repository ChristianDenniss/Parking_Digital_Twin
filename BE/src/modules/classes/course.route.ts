import { Router } from "express";
import * as controller from "./course.controller";

const router = Router();

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);

export default router;

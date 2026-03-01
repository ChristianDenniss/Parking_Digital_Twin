import { Router } from "express";
import * as controller from "./student.controller";

const router = Router();

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);

export default router;

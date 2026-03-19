import { Router } from "express";
import { asyncHandler } from "../../middleware";
import * as controller from "./user.controller";

const router = Router();

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));

export default router;

import { Request, Response } from "express";
import * as historicalService from "./historical.service";
import { createHistoricalSchema } from "./historical.schema";
import { validate } from "../../utils/validate";

export async function list(req: Request, res: Response) {
  const data = await historicalService.findAll();
  res.json(data);
}

export async function create(req: Request, res: Response) {
  const result = validate(createHistoricalSchema, req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });
  const row = await historicalService.create(result.data!);
  res.status(201).json(row);
}

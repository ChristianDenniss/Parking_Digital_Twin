import { Request, Response } from "express";
import * as buildingService from "./building.service";

export async function mapMarkersGeoJson(req: Request, res: Response) {
  const debug = req.query.debug === "1" || req.query.debug === "true";
  try {
    const geojson = await buildingService.getMapMarkersGeoJSON(debug);
    res.set("Cache-Control", "public, max-age=300");
    res.json(geojson);
  } catch (err) {
    console.error("[buildings] GET /map-markers/geojson → 502", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to load building marker GeoJSON",
    });
  }
}

export async function list(req: Request, res: Response) {
  const buildings = await buildingService.findAll();
  res.json(buildings);
}

export async function getById(req: Request, res: Response) {
  const building = await buildingService.findById(req.params.id);
  if (!building) return res.status(404).json({ error: "Building not found" });
  res.json(building);
}

export async function create(req: Request, res: Response) {
  const { name, code, floors } = req.body as { name?: string; code?: string; floors?: number };
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const building = await buildingService.create({
    name: name.trim(),
    code: typeof code === "string" ? code.trim() || null : null,
    floors: typeof floors === "number" && Number.isInteger(floors) && floors >= 0 ? floors : null,
  });
  res.status(201).json(building);
}

export async function update(req: Request, res: Response) {
  const { name, code, floors } = req.body as { name?: string; code?: string; floors?: number };
  const data: Partial<{ name: string; code: string | null; floors: number | null }> = {};
  if (typeof name === "string") data.name = name.trim();
  if (code !== undefined) data.code = typeof code === "string" ? code.trim() || null : null;
  if (floors !== undefined) data.floors = typeof floors === "number" && Number.isInteger(floors) && floors >= 0 ? floors : null;
  const building = await buildingService.update(req.params.id, data);
  if (!building) return res.status(404).json({ error: "Building not found" });
  res.json(building);
}

export async function remove(req: Request, res: Response) {
  const building = await buildingService.remove(req.params.id);
  if (!building) return res.status(404).json({ error: "Building not found" });
  res.status(204).send();
}

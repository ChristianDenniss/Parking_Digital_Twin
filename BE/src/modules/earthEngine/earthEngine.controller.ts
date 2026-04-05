import { Request, Response } from "express";
import * as earthEngineService from "./earthEngine.service";

function earthEngineHttpCacheControl(): string {
  return earthEngineService.isEarthEngineInProcessCacheDisabled()
    ? "no-store"
    : "public, max-age=3600";
}

function earthEngineSectionsHttpCacheControl(): string {
  return earthEngineService.isEarthEngineInProcessCacheDisabled()
    ? "no-store"
    : "public, max-age=300";
}

/**
 * GET /api/earth-engine/tiles
 * Returns the tile URL template for use in a map TileLayer.
 * Tiles are served through this backend (proxy); no token is exposed to the client.
 * Optional query: asset (default "unbsj") for UNBSJ image + parking sections.
 * Use relative path so it works with SPA proxy (e.g. Vite proxy /api -> backend).
 */
export async function getTileUrl(req: Request, res: Response) {
  const asset = (req.query.asset as string)?.trim() || "unbsj";
  const tileUrl = `/api/earth-engine/tiles/{z}/{x}/{y}?asset=${encodeURIComponent(asset)}`;
  console.log("[earth-engine] GET /tiles → 200", { asset, tileUrl });
  return res.json({ tileUrl });
}

/**
 * GET /api/earth-engine/tiles/:z/:x/:y
 * Query: asset (required). Optional: min, max (visualization).
 * Returns: tile image (PNG) proxied from Earth Engine; mapid/token stay on server.
 * Use as tile URL in map libraries, e.g. urlTemplate: "/api/earth-engine/tiles/{z}/{x}/{y}?asset=USGS/SRTMGL1_003"
 */
export async function getTile(req: Request, res: Response) {
  const asset = (req.query.asset as string)?.trim();
  if (!asset) {
    return res.status(400).json({ error: "Query parameter 'asset' is required" });
  }
  const z = parseInt(req.params.z, 10);
  const x = parseInt(req.params.x, 10);
  const y = parseInt(req.params.y, 10);
  if (Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
    return res.status(400).json({ error: "Invalid tile coordinates z, x, y" });
  }
  try {
    const min = req.query.min != null ? Number(req.query.min) : undefined;
    const max = req.query.max != null ? Number(req.query.max) : undefined;
    const { buffer, contentType } = await earthEngineService.fetchTile(
      asset,
      z,
      x,
      y,
      { min, max }
    );
    res.set("Content-Type", contentType);
    res.set("Cache-Control", earthEngineHttpCacheControl());
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Earth Engine tile error:", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to fetch tile",
    });
  }
}

/**
 * GET /api/earth-engine/sections
 * Returns parking section polygons as GeoJSON for hover (tooltip) and click (navigate to lot).
 */
export async function getSections(req: Request, res: Response) {
  try {
    const geojson = await earthEngineService.getSectionsGeoJSON();
    const featureCount = geojson.features?.length ?? 0;
    console.log("[earth-engine] GET /sections → 200", { featureCount });
    res.set("Cache-Control", earthEngineSectionsHttpCacheControl());
    return res.json(geojson);
  } catch (err) {
    console.error("[earth-engine] GET /sections → 502", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to load sections GeoJSON",
    });
  }
}

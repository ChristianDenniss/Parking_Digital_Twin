import { Request, Response } from "express";
import * as earthEngineService from "./earthEngine.service";

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
  return res.json({ tileUrl });
}

/**
 * GET /api/earth-engine/thumbnail
 * Query: asset (required, e.g. "USGS/SRTMGL1_003"), dimensions (optional, e.g. "1024x1024"), format (optional, png|jpg)
 * Returns: redirect to the temporary thumbnail URL (PNG/JPG from Earth Engine).
 */
export async function getThumbnail(req: Request, res: Response) {
  const asset = (req.query.asset as string)?.trim();
  if (!asset) {
    return res.status(400).json({ error: "Query parameter 'asset' is required (e.g. USGS/SRTMGL1_003)" });
  }
  try {
    const dimensions = (req.query.dimensions as string) || "512x512";
    const format = (req.query.format as string) === "jpg" ? "jpg" : "png";
    const url = await earthEngineService.getThumbURL(asset, { dimensions, format });
    return res.redirect(302, url);
  } catch (err) {
    console.error("Earth Engine thumbnail error:", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to get Earth Engine thumbnail",
    });
  }
}

/**
 * GET /api/earth-engine/mapid
 * Query: asset (required), min, max (optional visualization params)
 * Returns: { mapid, token } for use with map tiles (e.g. Google Maps overlay).
 */
export async function getMapId(req: Request, res: Response) {
  const asset = (req.query.asset as string)?.trim();
  if (!asset) {
    return res.status(400).json({ error: "Query parameter 'asset' is required" });
  }
  try {
    const min = req.query.min != null ? Number(req.query.min) : undefined;
    const max = req.query.max != null ? Number(req.query.max) : undefined;
    const result = await earthEngineService.getMapId(asset, { min, max });
    return res.json(result);
  } catch (err) {
    console.error("Earth Engine getMapId error:", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to get Earth Engine map ID",
    });
  }
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
    res.set("Cache-Control", "public, max-age=3600"); // tiles can be cached by client
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
    res.set("Cache-Control", "public, max-age=300"); // 5 min
    return res.json(geojson);
  } catch (err) {
    console.error("Earth Engine sections error:", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to load sections GeoJSON",
    });
  }
}

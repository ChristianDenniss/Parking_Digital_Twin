/**
 * Read KML route export(s) from Google Maps / Earth and write a flat edge list (JSON)
 * for lot–building walking distances (meters along the LineString).
 *
 * Usage:
 *   npx ts-node scripts/kml-to-edges.ts path/to/routes.kml
 *     → writes BE/data/lot-building-walking-edges.json
 *   npx ts-node scripts/kml-to-edges.ts path/to/routes.kml path/to/custom.json
 *   npx ts-node scripts/kml-to-edges.ts path/to/routes.kml -
 *     → JSON to stdout
 */
import fs from "fs";
import path from "path";
import { edgesFromKmlString } from "./lib/walkingRouteKml";

const DEFAULT_OUT = path.join(__dirname, "../data/lot-building-walking-edges.json");

// Hardcoded input/output for one-off script
const inputPath = path.join(__dirname, "../data/DTParkingDistances.kml");
const outputPath = path.join(__dirname, "../data/lot-building-walking-edges.json");

const absIn = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
const kml = fs.readFileSync(absIn, "utf-8");
const edges = edgesFromKmlString(kml);
const json = JSON.stringify(edges, null, 2);

// Always write to file (no CLI options)
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, json + "\n", "utf-8");

console.log(`Wrote ${edges.length} edges to ${outputPath}`);

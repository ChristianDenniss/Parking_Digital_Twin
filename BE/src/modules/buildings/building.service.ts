import { AppDataSource } from "../../db/data-source";
import { Building } from "./building.entity";
import * as earthEngineService from "../earthEngine/earthEngine.service";

const BUILDING_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stringFromUnknown(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function buildingByOfficialName(official: string, allBuildings: Building[]): Building | null {
  const q = official.trim().toLowerCase();
  return (
    allBuildings.find((b) => b.name.trim().toLowerCase() === q) ??
    allBuildings.find((b) => b.code != null && b.code.trim().toLowerCase() === q) ??
    null
  );
}

/** GEE getInfo often returns numbers (e.g. `system:index`); coerce for label matching. */
function geePropertyToLabelString(v: unknown): string | null {
  const s = stringFromUnknown(v);
  if (s) return s;
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

/** `unbsjMarkersV2`: feature id / `system:index` strings match `buildings.name` (case-insensitive). */
function tryBuildingFromGeeFeatureName(
  props: Record<string, unknown>,
  allBuildings: Building[]
): Building | null {
  for (const raw of [props["system:index"], props.geeFeatureId, props.id]) {
    const label = geePropertyToLabelString(raw)?.trim();
    if (!label) continue;
    const b = buildingByOfficialName(label, allBuildings);
    if (b) return b;
  }
  return null;
}

/** GeoJSON for campus map: GEE building points merged with `buildings` rows (same idea as parking sections GeoJSON). */
export interface BuildingMapMarkersGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] | [number, number, number] };
    properties: {
      buildingId: string | null;
      name: string;
      code: string | null;
      floors: number | null;
      latitude: number;
      longitude: number;
      /** Ellipsoid / asset elevation in meters when known (GeoJSON Z or GEE property). */
      elevationMeters: number | null;
      matched: boolean;
      geeProperties?: Record<string, unknown>;
    };
  }>;
}

/**
 * Match a string property: exact `buildings.name` / `code`, then fuzzy `findBuildingForCourseBuilding`.
 */
async function matchGeeLabelStringToBuilding(s: string, allBuildings: Building[]): Promise<Building | null> {
  const t = s.trim();
  if (!t || BUILDING_UUID_RE.test(t)) return null;
  const direct = buildingByOfficialName(t, allBuildings);
  if (direct) return direct;
  const fuzzy = await findBuildingForCourseBuilding(t);
  if (fuzzy) return fuzzy;
  const head = t.includes("_") ? t.split("_")[0]!.trim() : "";
  if (head && head !== t) return matchGeeLabelStringToBuilding(head, allBuildings);
  return null;
}

async function matchGeeMarkerViaWalkingEdgeTable(
  props: Record<string, unknown>,
  allBuildings: Building[]
): Promise<Building | null> {
  const fromFeatureName = tryBuildingFromGeeFeatureName(props, allBuildings);
  if (fromFeatureName) return fromFeatureName;

  const tryLabel = async (raw: unknown): Promise<Building | null> => {
    const s = geePropertyToLabelString(raw);
    if (!s || !/[a-zA-Z]/.test(s) || BUILDING_UUID_RE.test(s)) return null;
    return matchGeeLabelStringToBuilding(s, allBuildings);
  };

  // EE often puts the asset-style id on the feature root; we copy it to `geeFeatureId`.
  const fromGeeId = await tryLabel(props.geeFeatureId);
  if (fromGeeId) return fromGeeId;

  const preferredKeys = [
    "name",
    "Name",
    "label",
    "building",
    "buildingName",
    "building_name",
    "BUILDING",
    "title",
    "Title",
    "SITE_NAME",
    "BldgName",
    "bldg_name",
    "id",
    "ID",
  ];
  for (const k of preferredKeys) {
    const b = await tryLabel(props[k]);
    if (b) return b;
  }
  for (const [k, v] of Object.entries(props)) {
    if (k === "geeFeatureId") continue;
    const b = await tryLabel(v);
    if (b) return b;
  }
  return null;
}

const repo = () => AppDataSource.getRepository(Building);

export async function findAll(): Promise<Building[]> {
  return repo().find({ order: { name: "ASC" } });
}

export async function findById(id: string): Promise<Building | null> {
  return repo().findOne({ where: { id } });
}

export async function create(data: {
  name: string;
  code?: string | null;
  floors?: number | null;
}): Promise<Building> {
  const b = repo().create({
    name: data.name,
    code: data.code ?? null,
    floors: data.floors ?? null,
  });
  return repo().save(b);
}

export async function update(
  id: string,
  data: Partial<{ name: string; code: string | null; floors: number | null }>
): Promise<Building | null> {
  const b = await repo().findOne({ where: { id } });
  if (!b) return null;
  if (data.name !== undefined) b.name = data.name;
  if (data.code !== undefined) b.code = data.code;
  if (data.floors !== undefined) b.floors = data.floors;
  return repo().save(b);
}

export async function remove(id: string): Promise<Building | null> {
  const b = await repo().findOne({ where: { id } });
  if (!b) return null;
  await repo().remove(b);
  return b;
}

/**
 * Match a course `building` string (e.g. "Hazen Hall") to a campus building row.
 * Handles shortened names vs full names (e.g. "Hazen Hall" → "Sir Douglas Hazen Hall").
 */
export async function findBuildingForCourseBuilding(courseBuilding: string | null | undefined): Promise<Building | null> {
  const raw = courseBuilding?.trim();
  if (!raw) return null;
  const q = raw.toLowerCase();
  const all = await findAll();

  const exact = all.find(
    (b) => b.name.toLowerCase() === q || (b.code != null && b.code.toLowerCase() === q)
  );
  if (exact) return exact;

  const contains = all.find(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      q.includes(b.name.toLowerCase())
  );
  if (contains) return contains;

  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return null;

  let best: { b: Building; score: number } | null = null;
  for (const b of all) {
    const n = b.name.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (n.includes(t)) score += t.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { b, score };
  }
  return best?.b ?? null;
}

function elevationFromMarkerGeometryAndProps(
  coordinates: readonly number[],
  props: Record<string, unknown>
): number | null {
  if (coordinates.length >= 3 && Number.isFinite(coordinates[2])) {
    return coordinates[2]!;
  }
  const keys = [
    "elevation",
    "Elevation",
    "z",
    "Z",
    "altitude",
    "Altitude",
    "height",
    "HEIGHT",
    "elev_m",
  ];
  for (const k of keys) {
    const v = props[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function matchMarkerPropertiesToBuilding(
  props: Record<string, unknown>,
  allBuildings: Building[]
): Promise<Building | null> {
  const idCandidates = [
    props.buildingId,
    props.building_id,
    props.buildingUuid,
    props.buildingUUID,
    props.id,
  ];
  for (const c of idCandidates) {
    const t = stringFromUnknown(c);
    if (!t || !BUILDING_UUID_RE.test(t)) continue;
    const b = await findById(t);
    if (b) return b;
  }
  const viaWalking = await matchGeeMarkerViaWalkingEdgeTable(props, allBuildings);
  if (viaWalking) return viaWalking;
  const nameCandidates = [
    props.name,
    props.building,
    props.Building,
    props.buildingName,
    props.building_name,
    props.BUILDING,
    props.label,
    props.title,
    props.Title,
    props.SITE_NAME,
    props.BldgName,
  ];
  for (const n of nameCandidates) {
    const s = stringFromUnknown(n);
    if (s) {
      const b = await findBuildingForCourseBuilding(s);
      if (b) return b;
    }
  }
  return null;
}

/** Readable label from GEE props when we could not match a DB row. */
function displayNameFromGeeProperties(props: Record<string, unknown>): string | null {
  const keys = [
    "name",
    "Name",
    "label",
    "building",
    "buildingName",
    "building_name",
    "title",
    "Title",
    "SITE_NAME",
    "BldgName",
  ];
  for (const k of keys) {
    const s = stringFromUnknown(props[k]);
    if (s) return s;
  }
  const geeIdLabel = stringFromUnknown(props.geeFeatureId);
  if (geeIdLabel) return geeIdLabel;

  for (const [k, v] of Object.entries(props)) {
    if (k === "geeFeatureId") continue;
    const s = stringFromUnknown(v);
    if (s) return s;
  }
  return null;
}

let warnedEmptyBuildingsForMarkers = false;

/**
 * GEE building marker points + DB buildings (same flow as sections: GEE getInfo → API → Leaflet).
 * Match: UUID `buildingId` if present, then feature id / `system:index` = `buildings.name`, then fuzzy name fields.
 */
export async function getMapMarkersGeoJSON(debug: boolean): Promise<BuildingMapMarkersGeoJSON> {
  const raw = await earthEngineService.getBuildingMarkersFromEarthEngine();
  const allBuildings = await findAll();
  if (allBuildings.length === 0 && !warnedEmptyBuildingsForMarkers) {
    warnedEmptyBuildingsForMarkers = true;
    console.warn(
      "[buildings] map-markers: no rows in `buildings` — run `npm run seed` (or insert buildings) so markers can match names."
    );
  }
  const features: BuildingMapMarkersGeoJSON["features"] = [];
  for (const r of raw) {
    const coords = r.geometry.coordinates;
    const lng = coords[0]!;
    const lat = coords[1]!;
    const building = await matchMarkerPropertiesToBuilding(r.properties, allBuildings);
    const elevationMeters = elevationFromMarkerGeometryAndProps(coords, r.properties);
    const geeFallback = displayNameFromGeeProperties(r.properties);
    const baseProps = {
      buildingId: building?.id ?? null,
      name: building?.name ?? geeFallback ?? "Unknown building",
      code: building?.code ?? null,
      floors: building?.floors ?? null,
      latitude: lat,
      longitude: lng,
      elevationMeters,
      matched: Boolean(building),
    };
    features.push({
      type: "Feature",
      geometry: r.geometry,
      properties: debug ? { ...baseProps, geeProperties: r.properties } : baseProps,
    });
  }
  return { type: "FeatureCollection", features };
}

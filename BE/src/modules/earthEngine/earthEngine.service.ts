import path from "path";
import fs from "fs";
import { getAppMode } from "../../config/appMode";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ee = require("@google/earthengine") as {
  Image: (id: string) => {
    getMap: (params: object, callback: (r: MapIdResult) => void) => void;
    visualize: (params: object) => {
      blend: (other: unknown) => { getMap: (params: object, callback: (r: MapIdResult) => void) => void };
    };
  };
  FeatureCollection: (id: string) => {
    style: (params: { color?: string; width?: number; fillColor?: string }) => unknown;
    getInfo: (callback: (info: FeatureCollectionInfo | null, err?: Error) => void) => void;
  };
  data: {
    authenticateViaPrivateKey: (
      key: object,
      success: () => void,
      error: (err: Error) => void
    ) => void;
  };
  initialize: (
    _a: unknown,
    _b: unknown,
    success: () => void,
    error: (err: Error) => void
  ) => void;
};

/** Asset IDs for the UNBSJ parking composite (image + section polygons). */
const UNBSJ_IMAGE_ASSET = "projects/cs4555/assets/unbsjIMAGE";
const UNBSJ_SECTIONS_ASSET = "projects/cs4555/assets/unbsj_parking_sectionsVersion2";
/** Building POI points (same pattern as sections: load via getInfo, merge with DB on the server). */
const UNBSJ_BUILDING_MARKERS_ASSET = "projects/cs4555/assets/unbsjMarkersV2";

/** Lot names in same order as GEE unbsj_parking_sections features (for tooltip/click when GEE has no name prop). */
const SECTION_LOT_NAMES = [
  "StaffParking1",
  "GeneralParking1",
  "GeneralParking2",
  "GeneralParking3",
  "TimedParking1",
  "GeneralParking4",
  "TimedParking2",
  "StaffParking2",
  "ResidentParking1",
  "ResidentParking2",
  "StaffParking3",
  "TBD",
  "PHDParking1",
  "GeneralParking5",
  "StaffParking4",
  "ResidentParking3",
] as const;

/** Result of FeatureCollection.getInfo: features with geometry and properties. */
interface FeatureCollectionInfo {
  features?: Array<{
    type?: string;
    geometry?: { type: string; coordinates: unknown };
    properties?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  properties?: Record<string, unknown>;
}

let initialized = false;

function getCredentialsPath(): string {
  const envPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.EARTH_ENGINE_SERVICE_ACCOUNT_PATH;
  if (envPath) return path.resolve(envPath);
  const defaultPath = path.join(__dirname, "..", "..", "..", "serviceAccount.json");
  return defaultPath;
}

function loadCredentialsFromEnvJson(): object | null {
  const raw = process.env.EARTH_ENGINE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as object;
  } catch (err) {
    throw new Error(
      `EARTH_ENGINE_SERVICE_ACCOUNT_JSON is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

function loadCredentialsFromSplitEnv(): object | null {
  const clientEmail = process.env.EARTH_ENGINE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.EARTH_ENGINE_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) return null;
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const projectId = process.env.EARTH_ENGINE_PROJECT_ID?.trim();
  const privateKeyId = process.env.EARTH_ENGINE_PRIVATE_KEY_ID?.trim();
  return {
    type: "service_account",
    client_email: clientEmail,
    private_key: privateKey,
    ...(projectId ? { project_id: projectId } : {}),
    ...(privateKeyId ? { private_key_id: privateKeyId } : {}),
  };
}

function loadCredentials(): object {
  const envJson = loadCredentialsFromEnvJson();
  if (envJson) return envJson;

  const splitEnv = loadCredentialsFromSplitEnv();
  if (splitEnv) return splitEnv;

  const credPath = getCredentialsPath();
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Earth Engine credentials not found. Use EARTH_ENGINE_SERVICE_ACCOUNT_JSON, or EARTH_ENGINE_CLIENT_EMAIL + EARTH_ENGINE_PRIVATE_KEY, or set GOOGLE_APPLICATION_CREDENTIALS / EARTH_ENGINE_SERVICE_ACCOUNT_PATH to a file (tried ${credPath}).`
    );
  }
  const raw = fs.readFileSync(credPath, "utf-8");
  return JSON.parse(raw) as object;
}

function authenticate(): Promise<void> {
  return new Promise((resolve, reject) => {
    const credentials = loadCredentials();
    ee.data.authenticateViaPrivateKey(
      credentials,
      () => resolve(),
      (err: Error) => reject(err)
    );
  });
}

function initialize(): Promise<void> {
  return new Promise((resolve, reject) => {
    ee.initialize(
      null,
      null,
      () => resolve(),
      (err: Error) => reject(err)
    );
  });
}

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await authenticate();
  await initialize();
  initialized = true;
}

export interface MapIdResult {
  mapid: string;
  token?: string;
  /** Tile URL template with {z}, {x}, {y}; use this when present for correct GEE format. */
  urlFormat?: string;
}

/** Normalize getMap callback result: ensure urlFormat from urlFormat or tile_fetcher.url_format. */
function normalizeMapIdResult(raw: MapIdResult & { tile_fetcher?: { url_format?: string } }): MapIdResult {
  const urlFormat =
    raw.urlFormat ?? (raw.tile_fetcher?.url_format);
  return {
    mapid: raw.mapid,
    token: raw.token,
    ...(urlFormat && { urlFormat }),
  };
}

/**
 * When true, skips all in-process Earth Engine caches (mapId, sections GeoJSON, proxied tile buffers).
 *
 * Default: cache **disabled** unless `APP_MODE=production` (same notion as the rest of the app: `local` → fresh GEE).
 * If `APP_MODE` is unset, `getAppMode()` falls back to `NODE_ENV` (production → prod mode, else local).
 * Override: `EARTH_ENGINE_DISABLE_CACHE=1` forces off; `EARTH_ENGINE_ENABLE_CACHE=1` forces on (e.g. load-test locally).
 */
export function isEarthEngineInProcessCacheDisabled(): boolean {
  const disable = process.env.EARTH_ENGINE_DISABLE_CACHE?.trim().toLowerCase();
  if (disable === "1" || disable === "true" || disable === "yes") return true;
  const enable = process.env.EARTH_ENGINE_ENABLE_CACHE?.trim().toLowerCase();
  if (enable === "1" || enable === "true" || enable === "yes") return false;
  return getAppMode() !== "production";
}

const MAPID_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const mapIdCache = new Map<
  string,
  { result: MapIdResult; expiresAt: number }
>();

function cacheKey(asset: string, visParams?: Record<string, unknown>): string {
  return `${asset}|${JSON.stringify(visParams ?? {})}`;
}

/**
 * Get a map ID for an Earth Engine image or named layer (cached per asset+visParams when cache is enabled).
 * Use asset "unbsj" for the UNBSJ image + parking sections composite.
 */
export async function getMapIdCached(
  imageAssetId: string,
  visParams?: { min?: number; max?: number; palette?: string; bands?: string[] }
): Promise<MapIdResult> {
  const noCache = isEarthEngineInProcessCacheDisabled();
  const key = cacheKey(imageAssetId, visParams);
  if (!noCache) {
    const cached = mapIdCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
  }
  const result =
    imageAssetId === "unbsj"
      ? await getMapIdForUnbsj()
      : await getMapId(imageAssetId, visParams);
  if (!noCache) {
    mapIdCache.set(key, {
      result,
      expiresAt: Date.now() + MAPID_CACHE_TTL_MS,
    });
  }
  return result;
}

/**
 * Get a map ID for an Earth Engine image (for use with map tiles).
 * @param imageAssetId - e.g. "CGIAR/SRTM90_V4" or "USGS/SRTMGL1_003"
 * @param visParams - optional min/max, palette, etc.
 */
function getMapId(
  imageAssetId: string,
  visParams?: { min?: number; max?: number; palette?: string; bands?: string[] }
): Promise<MapIdResult> {
  return new Promise((resolve, reject) => {
    ensureInitialized()
      .then(() => {
        const image = ee.Image(imageAssetId);
        const params = visParams || {};
        image.getMap(params, (result: MapIdResult & { tile_fetcher?: { url_format?: string } }) =>
          resolve(normalizeMapIdResult(result))
        );
      })
      .catch(reject);
  });
}

/**
 * UNBSJ composite: TIFF image + parking section polygons (yellow outline, transparent fill).
 * Building POIs are drawn client-side from GET /api/buildings/map-markers/geojson (like section hover).
 */
function getMapIdForUnbsj(): Promise<MapIdResult> {
  return new Promise((resolve, reject) => {
    ensureInitialized()
      .then(() => {
        const image = ee.Image(UNBSJ_IMAGE_ASSET);
        const sections = ee.FeatureCollection(UNBSJ_SECTIONS_ASSET);
        const styledSections = sections.style({
          color: "yellow",
          width: 2,
          fillColor: "33FFFF00", // semi-transparent yellow (polygons filled)
        });
        const visParams = {
          bands: ["b1", "b2", "b3"],
          min: 0,
          max: 255,
          gamma: 1.4,
        };
        const combined = image.visualize(visParams).blend(styledSections);
        combined.getMap({}, (result: MapIdResult & { tile_fetcher?: { url_format?: string } }) =>
          resolve(normalizeMapIdResult(result))
        );
      })
      .catch(reject);
  });
}

/** One point from GEE `unbsjMarkersV2` (lon/lat, optional Z in meters if present). */
export interface BuildingMarkerRaw {
  geometry: { type: "Point"; coordinates: [number, number] | [number, number, number] };
  properties: Record<string, unknown>;
}

/**
 * Load building marker points from Earth Engine (no DB merge).
 * Expects Point geometries in `projects/cs4555/assets/unbsjMarkersV2` (feature ids = `buildings.name`).
 */
export function getBuildingMarkersFromEarthEngine(): Promise<BuildingMarkerRaw[]> {
  return new Promise((resolve, reject) => {
    ensureInitialized()
      .then(() => {
        const fc = ee.FeatureCollection(UNBSJ_BUILDING_MARKERS_ASSET);
        fc.getInfo((info: FeatureCollectionInfo | null, err?: Error) => {
          if (err) return reject(err);
          if (!info?.features?.length) return resolve([]);
          const out: BuildingMarkerRaw[] = [];
          for (const f of info.features) {
            const g = f.geometry as { type?: string; coordinates?: unknown } | undefined;
            if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) continue;
            const c = g.coordinates as number[];
            if (c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
            const raw =
              f.properties != null && typeof f.properties === "object" && !Array.isArray(f.properties)
                ? (f.properties as Record<string, unknown>)
                : {};
            const props: Record<string, unknown> = { ...raw };
            const fid = (f as { id?: string | number }).id;
            if (fid != null && fid !== "") {
              const sid = typeof fid === "number" ? String(fid) : String(fid).trim();
              if (sid) {
                props.geeFeatureId = sid;
                // GeoJSON often puts the business id only on the feature root; mirror into `properties.id`
                // so backend matchers see it (numeric EE ids stay out of `id` to avoid shadowing real columns).
                if (
                  /[a-zA-Z]/.test(sid) &&
                  (props.id === undefined || props.id === null || props.id === "")
                ) {
                  props.id = sid;
                }
              }
            }
            const coords: [number, number] | [number, number, number] =
              c.length >= 3 && Number.isFinite(c[2])
                ? [c[0]!, c[1]!, c[2]!]
                : [c[0]!, c[1]!];
            out.push({
              geometry: { type: "Point", coordinates: coords },
              properties: props,
            });
          }
          resolve(out);
        });
      })
      .catch(reject);
  });
}

/** GeoJSON FeatureCollection for parking sections (hover/click on map). */
export interface SectionsGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown> & { name: string };
  }>;
}

const SECTIONS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
let sectionsCache: { data: SectionsGeoJSON; expiresAt: number } | null = null;

/**
 * Get parking section polygons as GeoJSON for client-side hover/click.
 * Uses GEE FeatureCollection.getInfo; section name from feature properties (e.g. name, section, or first string prop).
 * Cached 30 min when in-process EE cache is enabled (see `isEarthEngineInProcessCacheDisabled`).
 */
export function getSectionsGeoJSON(): Promise<SectionsGeoJSON> {
  if (!isEarthEngineInProcessCacheDisabled() && sectionsCache && sectionsCache.expiresAt > Date.now()) {
    return Promise.resolve(sectionsCache.data);
  }
  return new Promise((resolve, reject) => {
    ensureInitialized()
      .then(() => {
        const fc = ee.FeatureCollection(UNBSJ_SECTIONS_ASSET);
        fc.getInfo((info: FeatureCollectionInfo | null, err?: Error) => {
          if (err) return reject(err);
          if (!info || !info.features || !Array.isArray(info.features)) {
            return reject(new Error("Earth Engine sections: no features returned"));
          }
          const features = info.features
            .filter((f) => f.geometry)
            .map((f, index) => {
              const props = f.properties || {};
              const fromProps =
                (props.name as string) ??
                (props.section as string) ??
                (Object.values(props).find((v) => typeof v === "string") as string);
              const rawName =
                fromProps && fromProps.trim() !== ""
                  ? fromProps.trim()
                  : SECTION_LOT_NAMES[index] ?? `Section ${index + 1}`;

              // Normalize short codes like G1/S2/R3/T1/P1 to full lot names.
              function expandShortCode(name: string): string {
                const trimmed = name.trim();
                const upper = trimmed.toUpperCase();

                // Map generic unknown label to TBD.
                if (upper === "UNKNOWN") return "TBD";

                // General parking: G1 → GeneralParking1
                const gMatch = /^G(\d+)$/.exec(upper);
                if (gMatch) return `GeneralParking${gMatch[1]}`;

                // Staff parking: S1 → StaffParking1
                const sMatch = /^S(\d+)$/.exec(upper);
                if (sMatch) return `StaffParking${sMatch[1]}`;

                // Resident parking: R1 → ResidentParking1
                const rMatch = /^R(\d+)$/.exec(upper);
                if (rMatch) return `ResidentParking${rMatch[1]}`;

                // Timed parking: T1 → TimedParking1
                const tMatch = /^T(\d+)$/.exec(upper);
                if (tMatch) return `TimedParking${tMatch[1]}`;

                // P1 → PHDParking
                if (upper === "P1") return "PHDParking";

                return name;
              }

              const name = expandShortCode(rawName);
              return {
                type: "Feature" as const,
                geometry: f.geometry!,
                properties: { ...props, name },
              };
            });
          const data: SectionsGeoJSON = { type: "FeatureCollection", features };
          if (!isEarthEngineInProcessCacheDisabled()) {
            sectionsCache = { data, expiresAt: Date.now() + SECTIONS_CACHE_TTL_MS };
          }
          resolve(data);
        });
      })
      .catch(reject);
  });
}

/** Build tile URL from mapid+token when urlFormat is not provided (fallback). */
function buildTileUrl(
  mapid: string,
  token: string | undefined,
  z: number,
  x: number,
  y: number
): string {
  const base = `https://earthengine.googleapis.com/map/${mapid}/${z}/${x}/${y}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

const TILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_TILE_CACHE_ENTRIES = 2000;
const tileCache = new Map<
  string,
  { buffer: ArrayBuffer; contentType: string; expiresAt: number }
>();

function tileCacheKey(
  asset: string,
  z: number,
  x: number,
  y: number,
  visParams?: Record<string, unknown>
): string {
  return `${asset}|${z}|${x}|${y}|${JSON.stringify(visParams ?? {})}`;
}

function evictTileCacheIfNeeded(): void {
  if (tileCache.size <= MAX_TILE_CACHE_ENTRIES) return;
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [key, entry] of tileCache) {
    if (entry.expiresAt <= now) toDelete.push(key);
  }
  toDelete.forEach((k) => tileCache.delete(k));
  if (tileCache.size <= MAX_TILE_CACHE_ENTRIES) return;
  const byAge = [...tileCache.entries()].sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt
  );
  const remove = byAge.slice(0, tileCache.size - MAX_TILE_CACHE_ENTRIES);
  remove.forEach(([k]) => tileCache.delete(k));
}

/**
 * Fetch a single tile from Earth Engine and return the image buffer + content-type.
 * Uses mapInfo.urlFormat when present (replace {z},{x},{y}), else builds URL from mapid+token.
 * Tile responses are cached in memory (24h TTL, max 2000 tiles) when in-process EE cache is enabled.
 */
export async function fetchTile(
  asset: string,
  z: number,
  x: number,
  y: number,
  visParams?: { min?: number; max?: number; palette?: string; bands?: string[] }
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const noCache = isEarthEngineInProcessCacheDisabled();
  const key = tileCacheKey(asset, z, x, y, visParams);
  if (!noCache) {
    const cached = tileCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { buffer: cached.buffer, contentType: cached.contentType };
    }
  }

  const mapInfo = await getMapIdCached(asset, visParams);
  const tileUrl = mapInfo.urlFormat
    ? mapInfo.urlFormat
        .replace("{z}", String(z))
        .replace("{x}", String(x))
        .replace("{y}", String(y))
    : buildTileUrl(mapInfo.mapid, mapInfo.token, z, x, y);

  const response = await fetch(tileUrl);
  if (!response.ok) {
    throw new Error(
      `Earth Engine tile error: ${response.status} ${response.statusText}`
    );
  }
  const buffer = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type") || "image/png";

  if (!noCache) {
    tileCache.set(key, {
      buffer,
      contentType,
      expiresAt: Date.now() + TILE_CACHE_TTL_MS,
    });
    evictTileCacheIfNeeded();
  }

  return { buffer, contentType };
}

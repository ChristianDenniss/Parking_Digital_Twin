/**
 * Parse Google Earth / Maps KML route exports: Placemark name "LotName to BuildingShortName"
 * and LineString coordinates → walking distance (meters) along the polyline.
 */

export interface LotBuildingWalkingEdge {
  parkingLotName: string;
  buildingCode: string;
  distanceMeters: number;
}

/**
 * Keys = normalizeDestinationKey("ShortName"). Multiple aliases for the same `buildings.code`
 * (typos / "Athletics" vs "Athletic", etc.).
 */
export const KML_DESTINATION_TO_BUILDING_CODE: Record<string, string> = {
  candagames: "Canada Games Stadium",
  canadagames: "Canada Games Stadium",
  canadgames: "Canada Games Stadium",
  dalhousie: "Dalhousie Medicine New Brunswick building",
  dalhousiemed: "Dalhousie Medicine New Brunswick building",
  ganong: "Ganong Hall",
  irving: "K.C. Irving Hall",
  irvinghall: "K.C. Irving Hall",
  hazen: "Sir Douglas Hazen Hall",
  hazenhall: "Sir Douglas Hazen Hall",
  becket: "Barry & Flora Beckett Residence",
  beckettres: "Barry & Flora Beckett Residence",
  mackay: "Colin B. Mackay Residence",
  mackayresidence: "Colin B. Mackay Residence",
  dunn: "Sir James Dunn Residence",
  dunnresidence: "Sir James Dunn Residence",
  condon: "Thomas J. Condon Student Centre",
  commons: "Hans W. Klohn Commons (library)",
  oland: "Philip W. Oland Hall",
  athletic: "G. Forbes Elliot Athletics Centre",
  athletics: "G. Forbes Elliot Athletics Centre",
  athleticcentre: "G. Forbes Elliot Athletics Centre",
};

function normalizeDestinationKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function resolveBuildingCode(destinationRaw: string): string {
  const key = normalizeDestinationKey(destinationRaw);
  const code = KML_DESTINATION_TO_BUILDING_CODE[key];
  if (!code) {
    const known = Object.keys(KML_DESTINATION_TO_BUILDING_CODE).join(", ");
    throw new Error(
      `Unknown KML destination "${destinationRaw}" (normalized "${key}"). Extend KML_DESTINATION_TO_BUILDING_CODE. Known keys: ${known}`
    );
  }
  return code;
}

/** Equirectangular approximation is fine for < few km; haversine is standard for geodesic segments. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function lineStringLengthMeters(coordinatesText: string): number {
  const tokens = coordinatesText.trim().split(/\s+/).filter(Boolean);
  let total = 0;
  let prev: { lon: number; lat: number } | null = null;
  for (const t of tokens) {
    const parts = t.split(",").map((p) => parseFloat(p));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;
    const lon = parts[0];
    const lat = parts[1];
    if (prev) total += haversineMeters(prev.lat, prev.lon, lat, lon);
    prev = { lon, lat };
  }
  return total;
}

/** "GeneralParking1 to CandaGames" / "StaffParking 1 to Oland" → lot + destination */
export function parseRouteTitle(name: string): { lot: string; destination: string } | null {
  const m = name.trim().match(/^(.+?)\s+to\s+(.+)$/i);
  if (!m) return null;
  return { lot: m[1].trim(), destination: m[2].trim() };
}

/** Match `ParkingLot.name` in seed (removes spaces; Google KML mislabel → real lot name). */
export function normalizeLotNameForSeed(lot: string): string {
  const compact = lot.replace(/\s+/g, "").trim();
  const lower = compact.toLowerCase();
  // KML export used "ReservedParking1" for the lot that is seeded as StaffParking2.
  if (lower === "reservedparking1") return "StaffParking2";
  return compact;
}

/**
 * Extract flat edges from one or more KML documents concatenated in a string.
 * Ignores `<?earth ...?>` and other non-XML chunks.
 */
export function edgesFromKmlString(kml: string): LotBuildingWalkingEdge[] {
  const byKey = new Map<string, LotBuildingWalkingEdge>();
  const placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let m: RegExpExecArray | null;
  while ((m = placemarkRe.exec(kml)) !== null) {
    const block = m[1];
    if (!/<LineString\b/i.test(block)) continue;
    const nameMatch = block.match(/<name>\s*([^<]*?)\s*<\/name>/i);
    const coordMatch = block.match(/<LineString[^>]*>[\s\S]*?<coordinates>\s*([^<]+)\s*<\/coordinates>/i);
    if (!nameMatch || !coordMatch) continue;
    const title = nameMatch[1].trim();
    const parsed = parseRouteTitle(title);
    if (!parsed) continue;
    const { lot: lotRaw, destination } = parsed;
    const distanceMeters = Math.round(lineStringLengthMeters(coordMatch[1]));
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) continue;
    const parkingLotName = normalizeLotNameForSeed(lotRaw);
    const buildingCode = resolveBuildingCode(destination);
    const edge = { parkingLotName, buildingCode, distanceMeters };
    byKey.set(`${parkingLotName}|${buildingCode}`, edge);
  }
  return Array.from(byKey.values());
}

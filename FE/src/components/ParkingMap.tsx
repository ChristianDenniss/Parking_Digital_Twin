import { useCallback } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Feature, GeoJsonObject } from "geojson";
import type { PathOptions, Layer } from "leaflet";
import type { ReactNode } from "react";
import type { BuildingMapMarkerFeatureProperties, ParkingLot } from "../api/types";

/** UNBSJ image center from GEE: ee.Geometry.Point([-66.08556199592792, 45.3065]) → [lat, lng]. */
const CENTER: [number, number] = [45.3065, -66.08556199592792];
const MIN_ZOOM = 17;
const MAX_ZOOM = 22;
const DEFAULT_ZOOM = 17;

/** Bounds: tighter north-south (less vertical scroll), same horizontal. */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [45.303, -66.092], // southwest
  [45.31, -66.079], // northeast
];

export type ParkingMapDataMode = "live" | "pick-time";

export type ScenarioPlayControl = {
  show: boolean;
  paused: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

interface ParkingMapProps {
  /** Tile URL template from /api/earth-engine/tiles (e.g. /api/earth-engine/tiles/{z}/{x}/{y}?asset=unbsj) */
  earthEngineTileUrl: string | null;
  /** Parking section polygons for hover tooltip + click to lot */
  sectionsGeoJSON?: GeoJsonObject | null;
  /** GEE building points merged with DB (tooltips: name, floors, long & lat). */
  buildingMarkersGeoJSON?: GeoJsonObject | null;
  /** Lots to resolve section name → lot id on click */
  lots?: ParkingLot[];
  /** Called when a section polygon is clicked; pass lot id to navigate */
  onSectionClick?: (lotId: string) => void;
  /** Live = current data; pick-time = scenario (time + day on parent). */
  mapDataMode?: ParkingMapDataMode;
  /** ISO `YYYY-MM-DD` for the scenario day when `mapDataMode` is `pick-time`. */
  scenarioDate?: string;
  /** Local `HH:mm` scenario clock time when `mapDataMode` is `pick-time`. */
  scenarioTimeHHmm?: string;
  /** PLAY / PAUSE when pick-time scenario is applied (same chrome as LIVE). */
  scenarioPlay?: ScenarioPlayControl | null;
  /** Centered spinner while apply-scenario / apply-live runs */
  scenarioLoading?: boolean;
  /** When set and `scenarioLoading` is true, overrides the default loading line (e.g. day parking plan). */
  scenarioLoadingMessage?: string;
  /** Live tab after leaving Pick time: show “Nowcasting Scenario…” while apply-live runs */
  nowcastingLiveApply?: boolean;
  /** Optional overlay (e.g. stats card) rendered on top of the map */
  children?: ReactNode;
  className?: string;
}

/** Transparent overlay so polygons are hoverable/clickable but not drawn on top of tiles */
const sectionsStyle: PathOptions = {
  color: "transparent",
  fillColor: "transparent",
  fillOpacity: 0,
  weight: 0,
};

function formatScenarioDateLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "—";
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatScenarioTimeLabel(hhmm: string): string {
  const parts = hhmm.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "—";
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function hasScenarioPicked(date: string, time: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) && /^\d{1,2}:\d{2}$/.test(time.trim());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildingMarkerTooltipHtml(p: BuildingMapMarkerFeatureProperties): string {
  const name = escapeHtml(p.name);
  const codeLine =
    p.code != null && String(p.code).trim() !== ""
      ? `<div class="text-slate-600 text-xs">Code: ${escapeHtml(String(p.code))}</div>`
      : "";
  const floors =
    p.floors != null && Number.isFinite(p.floors) ? String(p.floors) : "—";
  const lng = Number.isFinite(p.longitude) ? p.longitude.toFixed(6) : "—";
  const lat = Number.isFinite(p.latitude) ? p.latitude.toFixed(6) : "—";
  const unmatched =
    p.matched === false
      ? `<div class="text-amber-800 text-xs mt-1">Not linked to database — run backend seed to load buildings.</div>`
      : "";
  const lonLatLine = `<div class="text-slate-600 text-[11px] mt-1 tabular-nums">Long ${escapeHtml(lng)}, Lat ${escapeHtml(lat)}</div>`;
  return `<div class="font-medium text-slate-800">${name}</div>${codeLine}<div class="text-slate-700 text-xs mt-1">Floors: ${escapeHtml(floors)}</div>${lonLatLine}${unmatched}`;
}

/** Calendar compare in the user’s local timezone (scenario `YYYY-MM-DD` vs today). */
function scenarioDateVsToday(ymd: string): "future" | "past" | "today" | "invalid" {
  const s = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "invalid";
  const [ys, ms, ds] = s.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (![y, m, d].every((n) => Number.isFinite(n))) return "invalid";
  const now = new Date();
  const ty = now.getFullYear();
  const tm = now.getMonth() + 1;
  const td = now.getDate();
  if (y > ty || (y === ty && m > tm) || (y === ty && m === tm && d > td)) return "future";
  if (y < ty || (y === ty && m < tm) || (y === ty && m === tm && d < td)) return "past";
  return "today";
}

function mapLoadingCopy(
  mapDataMode: ParkingMapDataMode,
  scenarioDate: string,
  nowcastingLiveApply: boolean
): { text: string; aria: string } {
  if (nowcastingLiveApply) {
    return { text: "Nowcasting Scenario…", aria: "Nowcasting scenario" };
  }
  if (mapDataMode === "live") {
    return { text: "Updating map…", aria: "Updating map" };
  }
  const rel = scenarioDateVsToday(scenarioDate);
  if (rel === "future") return { text: "Forecasting Scenario…", aria: "Forecasting scenario" };
  if (rel === "past") return { text: "Hindcasting Scenario…", aria: "Hindcasting scenario" };
  return { text: "Updating map…", aria: "Updating map" };
}

const liveBadgeClass =
  "flex items-center justify-center gap-1.5 rounded-md bg-unb-red px-2.5 py-1 shadow-lg min-w-[4.5rem]";

export function ParkingMap({
  earthEngineTileUrl,
  sectionsGeoJSON,
  buildingMarkersGeoJSON,
  lots = [],
  onSectionClick,
  mapDataMode = "live",
  scenarioDate = "",
  scenarioTimeHHmm = "",
  scenarioPlay = null,
  scenarioLoading = false,
  scenarioLoadingMessage,
  nowcastingLiveApply = false,
  children,
  className = "",
}: ParkingMapProps) {
  const defaultCopy = mapLoadingCopy(mapDataMode, scenarioDate, nowcastingLiveApply);
  const loadingCopy =
    scenarioLoading && scenarioLoadingMessage?.trim()
      ? { text: scenarioLoadingMessage.trim(), aria: scenarioLoadingMessage.trim() }
      : defaultCopy;

  const onEachSection = useCallback(
    (feature: GeoJsonObject, layer: Layer) => {
      const props = (feature as Feature).properties as Record<string, unknown> | undefined;
      const featureName = (props?.name as string) ?? "Section";
      const normalize = (name: string) => name.replace(/\s+/g, "").toLowerCase();
      const normFeature = normalize(featureName);
      let lot =
        lots.find((l) => normalize(l.name) === normFeature) ??
        (normFeature === "phdparking"
          ? lots.find((l) => normalize(l.name).startsWith("phdparking1"))
          : undefined);
      const prettify = (name: string) =>
        name
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/([A-Za-z])(\d+)/g, "$1 $2")
          .trim();
      const displayName = prettify(featureName);
      layer.bindTooltip(displayName, {
        permanent: false,
        direction: "top",
        className: "font-medium text-slate-800",
      });
      layer.on("click", () => {
        if (lot && onSectionClick) onSectionClick(lot.id);
      });
    },
    [lots, onSectionClick]
  );

  const onEachBuildingMarker = useCallback((feature: GeoJsonObject, layer: Layer) => {
    const props = (feature as Feature).properties as BuildingMapMarkerFeatureProperties | undefined;
    if (!props) return;
    layer.bindTooltip(buildingMarkerTooltipHtml(props), {
      permanent: false,
      direction: "top",
      sticky: true,
      className: "max-w-[16rem] !bg-white/95 !border !border-slate-200 !shadow-md !rounded-md !px-2 !py-1.5",
    });
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <MapContainer
        center={CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full min-h-[400px] rounded-lg border-4 border-unb-red"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          zIndex={0}
          maxNativeZoom={19}
          maxZoom={22}
        />
        {earthEngineTileUrl && (
          <TileLayer
            url={earthEngineTileUrl}
            zIndex={1}
            maxNativeZoom={18}
            maxZoom={22}
          />
        )}
        {sectionsGeoJSON && (
          <GeoJSON
            data={sectionsGeoJSON}
            style={sectionsStyle}
            onEachFeature={onEachSection}
          />
        )}
        {buildingMarkersGeoJSON && (
          <GeoJSON
            data={buildingMarkersGeoJSON}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 8,
                stroke: false,
                fill: true,
                fillColor: "#e60000",
                fillOpacity: 1,
              })
            }
            onEachFeature={onEachBuildingMarker}
          />
        )}
      </MapContainer>
      {mapDataMode === "live" ? (
        <div
          className={`pointer-events-none absolute top-3 right-3 z-[1000] ${liveBadgeClass}`}
          role="status"
          aria-label="Live updating data"
        >
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          <span className="text-[10px] font-extrabold tracking-[0.2em] text-white drop-shadow-sm">
            LIVE
          </span>
        </div>
      ) : (
        <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-1.5">
          {scenarioPlay?.show ? (
            <button
              type="button"
              disabled={scenarioPlay.disabled}
              onClick={scenarioPlay.onToggle}
              className={`${liveBadgeClass} pointer-events-auto text-[10px] font-extrabold tracking-[0.15em] text-white drop-shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label={scenarioPlay.paused ? "Play scenario simulation" : "Pause scenario simulation"}
            >
              {!scenarioPlay.paused ? (
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
              ) : null}
              {scenarioPlay.paused ? "PLAY" : "PAUSE"}
            </button>
          ) : null}
          <div
            className="pointer-events-none max-w-[min(100%,9.5rem)] rounded-md bg-unb-red px-2 py-1 text-center shadow-lg"
            role="status"
            aria-label={
              hasScenarioPicked(scenarioDate, scenarioTimeHHmm)
                ? `Scenario ${formatScenarioTimeLabel(scenarioTimeHHmm)} on ${formatScenarioDateLabel(scenarioDate)}`
                : "Pick a date and time for the scenario"
            }
          >
            <p className="text-[8px] font-semibold uppercase tracking-wider text-white/90">Plan time (AST)</p>
            {hasScenarioPicked(scenarioDate, scenarioTimeHHmm) ? (
              <>
                <p className="text-sm font-extrabold tabular-nums leading-tight text-white drop-shadow-sm">
                  {formatScenarioTimeLabel(scenarioTimeHHmm)}
                </p>
                <p className="text-[9px] font-medium leading-tight text-white/85">
                  {formatScenarioDateLabel(scenarioDate)}
                </p>
              </>
            ) : (
              <p className="text-[10px] font-semibold leading-snug text-white/95 px-0.5 py-0.5">
                Select date &amp; time
              </p>
            )}
          </div>
        </div>
      )}
      {scenarioLoading ? (
        <div
          className="absolute inset-0 z-[2000] flex items-center justify-center rounded-lg bg-slate-900/35 backdrop-blur-[2px]"
          role="status"
          aria-busy="true"
          aria-label={loadingCopy.aria}
        >
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-xl">
            <span
              className="h-11 w-11 shrink-0 animate-spin rounded-full border-[3px] border-unb-red border-t-transparent"
              aria-hidden
            />
            <p className="text-sm font-medium text-slate-700">{loadingCopy.text}</p>
          </div>
        </div>
      ) : null}
      {children && (
        <div className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:max-w-sm z-[1000]">
          {children}
        </div>
      )}
    </div>
  );
}

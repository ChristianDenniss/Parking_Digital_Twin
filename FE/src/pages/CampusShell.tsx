import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { matchPath, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ParkingLot, ParkingSpot, SimulatorState } from "../api/types";
import { ParkingMap, type ParkingMapDataMode } from "../components/ParkingMap";
import unbLogoAlternate from "../images/UNBlogoAlternate.png";
import type { HomeOutletContextValue, LotSortOption } from "./Home";

const tokenKey = "parking_twin_token";

function isValidScenarioDateYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

function isValidScenarioTimeHm(s: string): boolean {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

function scenarioKey(dateYmd: string, timeHm: string): string {
  const tm = timeHm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return `${dateYmd}|`;
  const h = parseInt(tm[1]!, 10);
  const min = parseInt(tm[2]!, 10);
  return `${dateYmd}|${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const SS_MAP_MODE = "dt_home_mapMode";
const SS_SCENARIO_DATE = "dt_home_scenarioDate";
const SS_SCENARIO_TIME = "dt_home_scenarioTime";
const SS_SCENARIO_SYNCED = "dt_home_scenarioSyncedKey";
const POLL_INTERVAL_MS = 10_000;

function readPersistedMapPrefs(): {
  mapDataMode: ParkingMapDataMode;
  mapScenarioDate: string;
  mapScenarioTimeHHmm: string;
  scenarioSyncedKey: string | null;
} {
  if (typeof sessionStorage === "undefined") {
    return { mapDataMode: "live", mapScenarioDate: "", mapScenarioTimeHHmm: "", scenarioSyncedKey: null };
  }
  try {
    if (sessionStorage.getItem(SS_MAP_MODE) !== "pick-time") {
      return { mapDataMode: "live", mapScenarioDate: "", mapScenarioTimeHHmm: "", scenarioSyncedKey: null };
    }
    const date = sessionStorage.getItem(SS_SCENARIO_DATE) ?? "";
    const time = sessionStorage.getItem(SS_SCENARIO_TIME) ?? "";
    const synced = sessionStorage.getItem(SS_SCENARIO_SYNCED);
    return {
      mapDataMode: "pick-time",
      mapScenarioDate: date,
      mapScenarioTimeHHmm: time,
      scenarioSyncedKey: synced || null,
    };
  } catch {
    return { mapDataMode: "live", mapScenarioDate: "", mapScenarioTimeHHmm: "", scenarioSyncedKey: null };
  }
}

function tryOpenScenarioPicker(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void | Promise<void> };
  if (typeof el.showPicker !== "function") return;
  void Promise.resolve(el.showPicker()).catch(() => {});
}

interface SectionsGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown> & { name: string };
  }>;
}

interface Stats {
  totalSpots: number;
  occupied: number;
  empty: number;
  occupancyPercent: number;
}

/**
 * Pathless layout: keeps campus map + data mounted while navigating to Logs, Lots, Auth, etc.
 * Map is in-flow only on `/` (index); off-screen otherwise.
 */
export function CampusShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const onHomeIndex = matchPath({ path: "/", end: true }, location.pathname) != null;

  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [tileUrlError, setTileUrlError] = useState<string | null>(null);
  const [sectionsGeoJSON, setSectionsGeoJSON] = useState<SectionsGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lotSort, setLotSort] = useState<LotSortOption>("biggest");
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null
  );
  const [planDate, setPlanDate] = useState("");
  const persistedMap = useMemo(() => readPersistedMapPrefs(), []);
  const [mapDataMode, setMapDataMode] = useState<ParkingMapDataMode>(persistedMap.mapDataMode);
  const [mapScenarioDate, setMapScenarioDate] = useState(persistedMap.mapScenarioDate);
  const [mapScenarioTimeHHmm, setMapScenarioTimeHHmm] = useState(persistedMap.mapScenarioTimeHHmm);
  const [simPaused, setSimPaused] = useState(false);
  const [simMapMode, setSimMapMode] = useState<"live" | "scenario">("live");
  const [scenarioSyncedKey, setScenarioSyncedKey] = useState<string | null>(persistedMap.scenarioSyncedKey);
  const [scenarioApplying, setScenarioApplying] = useState(false);
  const [nowcastingLiveApply, setNowcastingLiveApply] = useState(false);
  const [scenarioApplyError, setScenarioApplyError] = useState<string | null>(null);
  const [dayPlanMapLoading, setDayPlanMapLoading] = useState(false);
  const campusMapSectionRef = useRef<HTMLElement | null>(null);
  const scrollCampusMapIntoView = useCallback(() => {
    campusMapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const applyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When set to `scenarioKey(...)`, the debounced apply effect skips once (plan-driven apply already ran). */
  const programmaticScenarioSkipDebounceRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_MAP_MODE, mapDataMode);
      sessionStorage.setItem(SS_SCENARIO_DATE, mapScenarioDate);
      sessionStorage.setItem(SS_SCENARIO_TIME, mapScenarioTimeHHmm);
      if (scenarioSyncedKey) sessionStorage.setItem(SS_SCENARIO_SYNCED, scenarioSyncedKey);
      else sessionStorage.removeItem(SS_SCENARIO_SYNCED);
    } catch {
      /* private mode / quota */
    }
  }, [mapDataMode, mapScenarioDate, mapScenarioTimeHHmm, scenarioSyncedKey]);

  useEffect(() => {
    api
      .get<SimulatorState>("/api/simulator")
      .then((s) => {
        setSimPaused(s.paused);
        setSimMapMode(s.mapMode);
      })
      .catch(() => {});
  }, []);

  const activateLiveMap = useCallback(async () => {
    const wasPickTime = mapDataMode === "pick-time";
    setMapDataMode("live");
    setMapScenarioDate("");
    setMapScenarioTimeHHmm("");
    setScenarioApplyError(null);
    setScenarioSyncedKey(null);
    setNowcastingLiveApply(wasPickTime);
    try {
      setScenarioApplying(true);
      await api.post("/api/parking-spots/apply-live", {});
      setSimPaused(false);
      setSimMapMode("live");
      const spotsData = await api.get<ParkingSpot[]>("/api/parking-spots");
      setSpots(spotsData);
    } catch (e) {
      setScenarioApplyError(e instanceof Error ? e.message : "Could not switch to live");
    } finally {
      setScenarioApplying(false);
      setNowcastingLiveApply(false);
    }
  }, [mapDataMode]);

  const toggleScenarioSimulation = useCallback(async () => {
    try {
      const next = !simPaused;
      await api.post<SimulatorState>("/api/simulator", { paused: next });
      setSimPaused(next);
    } catch (e) {
      setScenarioApplyError(e instanceof Error ? e.message : "Could not toggle simulator");
    }
  }, [simPaused]);

  const performScenarioApply = useCallback(
    async (date: string, time: string, opts?: { deterministic?: boolean }) => {
      setScenarioApplying(true);
      setScenarioApplyError(null);
      try {
        await api.post("/api/parking-spots/apply-scenario", {
          date,
          time,
          ...(opts?.deterministic ? { deterministic: true } : {}),
        });
        const spotsData = await api.get<ParkingSpot[]>("/api/parking-spots");
        setSpots(spotsData);
        const s = await api.get<SimulatorState>("/api/simulator");
        setSimPaused(s.paused);
        setSimMapMode(s.mapMode);
        setScenarioSyncedKey(scenarioKey(date, time));
      } catch (e) {
        setScenarioSyncedKey(null);
        setScenarioApplyError(e instanceof Error ? e.message : "apply-scenario failed");
      } finally {
        setScenarioApplying(false);
      }
    },
    []
  );

  useEffect(() => {
    if (mapDataMode !== "pick-time") return;
    if (!isValidScenarioDateYmd(mapScenarioDate) || !isValidScenarioTimeHm(mapScenarioTimeHHmm)) {
      return;
    }
    const key = scenarioKey(mapScenarioDate, mapScenarioTimeHHmm);
    if (programmaticScenarioSkipDebounceRef.current === key) {
      programmaticScenarioSkipDebounceRef.current = null;
      return;
    }
    if (applyDebounceRef.current) clearTimeout(applyDebounceRef.current);
    applyDebounceRef.current = setTimeout(() => {
      void performScenarioApply(mapScenarioDate, mapScenarioTimeHHmm);
    }, 450);
    return () => {
      if (applyDebounceRef.current) clearTimeout(applyDebounceRef.current);
    };
  }, [mapDataMode, mapScenarioDate, mapScenarioTimeHHmm, performScenarioApply]);

  const applyPlanPausedScenario = useCallback(
    async (dateYmd: string, timeHHmm: string) => {
      if (!isValidScenarioDateYmd(dateYmd) || !isValidScenarioTimeHm(timeHHmm)) return;
      const key = scenarioKey(dateYmd, timeHHmm);
      // Mark skip before any async gap so the debounced effect cannot enqueue
      // a second non-deterministic apply for this same programmatic scenario.
      programmaticScenarioSkipDebounceRef.current = key;
      if (applyDebounceRef.current) {
        clearTimeout(applyDebounceRef.current);
        applyDebounceRef.current = null;
      }
      setMapDataMode("pick-time");
      setMapScenarioDate(dateYmd);
      setMapScenarioTimeHHmm(timeHHmm);
      setScenarioApplyError(null);
      try {
        await api.post<SimulatorState>("/api/simulator", { mapMode: "scenario", paused: true });
        setSimMapMode("scenario");
        setSimPaused(true);
      } catch {
        /* still apply occupancy snapshot */
      }
      await performScenarioApply(dateYmd, timeHHmm, { deterministic: true });
    },
    [performScenarioApply]
  );

  /** Skip network if the campus map is already on this paused scenario (day-plan links / reload). */
  const applyPlanScenarioIfChanged = useCallback(
    async (dateYmd: string, timeHHmm: string) => {
      const key = scenarioKey(dateYmd, timeHHmm);
      if (mapDataMode === "pick-time" && scenarioSyncedKey === key) return;
      await applyPlanPausedScenario(dateYmd, timeHHmm);
    },
    [mapDataMode, scenarioSyncedKey, applyPlanPausedScenario]
  );

  useEffect(() => {
    const runLive = mapDataMode === "live" && !simPaused;
    const runScenario = mapDataMode === "pick-time" && simMapMode === "scenario" && !simPaused;
    if (!runLive && !runScenario) return;
    let cancelled = false;
    const poll = () => {
      if (cancelled || document.hidden || !navigator.onLine) return;
      api.get<ParkingSpot[]>("/api/parking-spots").then(setSpots).catch(() => {});
    };
    const onResume = () => poll();
    poll();
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [mapDataMode, simPaused, simMapMode]);

  useEffect(() => {
    const syncToken = () => setToken(localStorage.getItem(tokenKey));
    const onStorage = (e: StorageEvent) => {
      if (e.key === tokenKey) setToken(e.newValue);
    };
    window.addEventListener("focus", syncToken);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", syncToken);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<ParkingLot[]>("/api/parking-lots"),
      api.get<ParkingSpot[]>("/api/parking-spots"),
    ])
      .then(([lotsData, spotsData]) => {
        setLots(lotsData);
        setSpots(spotsData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get<{ tileUrl: string }>("/api/earth-engine/tiles")
      .then((data) => setTileUrl(data.tileUrl))
      .catch((e) => setTileUrlError(e.message));
  }, []);

  useEffect(() => {
    api
      .get<SectionsGeoJSON>("/api/earth-engine/sections")
      .then(setSectionsGeoJSON)
      .catch(() => setSectionsGeoJSON(null));
  }, []);

  const sectionsWithLotNames = useMemo(() => {
    if (!sectionsGeoJSON || !Array.isArray(sectionsGeoJSON.features) || sectionsGeoJSON.features.length === 0) {
      return sectionsGeoJSON;
    }
    const lotOrder = [
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
    ];
    const sortedLots = [...lots].sort(
      (a, b) => lotOrder.indexOf(a.name) - lotOrder.indexOf(b.name)
    );
    return {
      ...sectionsGeoJSON,
      features: sectionsGeoJSON.features.map((f, i) => {
        const backendName = (f.properties?.name as string | undefined)?.trim();
        const fallbackName = sortedLots[i]?.name ?? `Section ${i + 1}`;
        return {
          ...f,
          properties: {
            ...f.properties,
            name: backendName && backendName.length > 0 ? backendName : fallbackName,
          },
        };
      }),
    };
  }, [sectionsGeoJSON, lots]);

  const byLot = useMemo(() => {
    return lots.map((lot) => {
      const lotSpots = spots.filter((s) => s.parkingLotId === lot.id);
      const occupied = lotSpots.filter((s) => s.currentStatus === "occupied").length;
      const total = lotSpots.length;
      const empty = total - occupied;
      const occupancyPercent = total ? Math.round((occupied / total) * 100) : 0;
      const freePercent = total ? (empty / total) * 100 : 0;
      return {
        lot,
        total,
        occupied,
        empty,
        occupancyPercent,
        freePercent,
      };
    });
  }, [lots, spots]);

  const sortedByLot = useMemo(() => {
    const sorted = [...byLot];
    switch (lotSort) {
      case "most-free":
        return sorted.sort((a, b) => b.empty - a.empty);
      case "highest-free-pct":
        return sorted.sort((a, b) => b.freePercent - a.freePercent);
      case "biggest":
        return sorted.sort((a, b) => b.total - a.total);
      case "smallest":
        return sorted.sort((a, b) => a.total - b.total);
      default:
        return sorted;
    }
  }, [byLot, lotSort]);

  const homeOutletContext = useMemo<HomeOutletContextValue>(
    () => ({
      token,
      planDate,
      setPlanDate,
      sortedByLot,
      lotSort,
      setLotSort,
      navigate,
      applyPlanPausedScenario,
      applyPlanScenarioIfChanged,
      setDayPlanMapLoading,
      scrollCampusMapIntoView,
    }),
    [
      token,
      planDate,
      sortedByLot,
      lotSort,
      navigate,
      applyPlanPausedScenario,
      applyPlanScenarioIfChanged,
      setDayPlanMapLoading,
      scrollCampusMapIntoView,
    ]
  );

  if (onHomeIndex && loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="skeleton h-8 w-40" />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      </div>
    );
  }

  if (onHomeIndex && error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-red-600">
        Error loading parking data: {error}
      </div>
    );
  }

  const occupiedCount = spots.filter((s) => s.currentStatus === "occupied").length;
  const totalSpots = spots.length;
  const stats: Stats = {
    totalSpots,
    occupied: occupiedCount,
    empty: totalSpots - occupiedCount,
    occupancyPercent: totalSpots ? Math.round((occupiedCount / totalSpots) * 100) : 0,
  };

  const scenarioKeyCurrent =
    isValidScenarioDateYmd(mapScenarioDate) && isValidScenarioTimeHm(mapScenarioTimeHHmm)
      ? scenarioKey(mapScenarioDate, mapScenarioTimeHHmm)
      : null;
  const showScenarioPlayControl =
    mapDataMode === "pick-time" &&
    scenarioKeyCurrent != null &&
    scenarioSyncedKey === scenarioKeyCurrent &&
    !scenarioApplying;

  const statsOverlay = (
    <div className="rounded-lg border-2 border-unb-red bg-white/95 backdrop-blur p-4 shadow-lg">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {mapDataMode === "live" ? "Live occupancy" : "Scenario occupancy"}
      </p>
      <div className="grid grid-cols-4 gap-3 text-left">
        <div>
          <p className="text-lg font-bold">{stats.totalSpots.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Total</p>
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-600">{stats.empty.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Free</p>
        </div>
        <div>
          <p className="text-lg font-bold text-red-600">{stats.occupied.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Taken</p>
        </div>
        <div>
          <p className="text-lg font-bold text-unb-red">{stats.occupancyPercent}%</p>
          <p className="text-xs text-slate-500">Occupancy</p>
        </div>
      </div>
      {tileUrlError && (
        <p className="text-xs text-amber-600 mt-2">Map layer: {tileUrlError}</p>
      )}
    </div>
  );

  const mapShellClass = onHomeIndex
    ? "space-y-8"
    : "fixed -left-[10000px] top-0 z-0 w-[min(72rem,calc(100vw-3rem))] space-y-8 pointer-events-none";

  return (
    <div
      className={
        onHomeIndex
          ? "max-w-6xl mx-auto px-6 py-10 space-y-8"
          : "max-w-6xl mx-auto px-6 pt-4 pb-10"
      }
    >
      <div className={mapShellClass} aria-hidden={onHomeIndex ? undefined : true}>
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <img src={unbLogoAlternate} alt="University of New Brunswick" className="h-28 w-auto" />
            <h1 className="text-3xl font-bold text-unb-black">
              Parking Digital Twin
            </h1>
          </div>
          <p className="text-slate-600">
            Live view of parking occupancy on campus (simulated sensors).
          </p>
        </header>

        <section ref={campusMapSectionRef} id="campus-map-section" className="scroll-mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="text-lg font-semibold">Campus map (Google Earth Engine API)</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex h-8 box-border items-stretch overflow-hidden rounded-md border-2 border-unb-red bg-white shadow-sm"
                role="group"
                aria-label="Map data context"
              >
                <button
                  type="button"
                  onClick={() => void activateLiveMap()}
                  className={`flex items-center justify-center px-3 text-xs font-semibold leading-none transition-colors ${
                    mapDataMode === "live"
                      ? "bg-unb-red text-white"
                      : "text-slate-900 hover:bg-unb-red/5"
                  }`}
                >
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMapDataMode("pick-time");
                    setMapScenarioDate("");
                    setMapScenarioTimeHHmm("");
                    setScenarioSyncedKey(null);
                    setScenarioApplyError(null);
                    void api
                      .post<SimulatorState>("/api/simulator", { mapMode: "scenario", paused: true })
                      .then((s) => {
                        setSimMapMode(s.mapMode);
                        setSimPaused(s.paused);
                      })
                      .catch(() => {});
                  }}
                  className={`flex items-center justify-center border-l-2 border-unb-red px-3 text-xs font-semibold leading-none transition-colors ${
                    mapDataMode === "pick-time"
                      ? "bg-unb-red text-white"
                      : "text-slate-900 hover:bg-unb-red/5"
                  }`}
                >
                  Pick time
                </button>
              </div>
              {mapDataMode === "pick-time" && (
                <>
                  <input
                    type="time"
                    value={mapScenarioTimeHHmm}
                    onChange={(e) => setMapScenarioTimeHHmm(e.target.value)}
                    onClick={tryOpenScenarioPicker}
                    aria-label="Scenario time"
                    className="map-scenario-datetime box-border h-8 cursor-pointer rounded-md border-2 border-unb-red bg-white text-sm font-medium leading-none text-slate-900 focus:border-unb-red focus:outline-none focus:ring-2 focus:ring-unb-red/25"
                  />
                  <input
                    type="date"
                    value={mapScenarioDate}
                    onChange={(e) => setMapScenarioDate(e.target.value)}
                    onClick={tryOpenScenarioPicker}
                    aria-label="Scenario date"
                    className="map-scenario-datetime box-border h-8 cursor-pointer rounded-md border-2 border-unb-red bg-white text-sm font-medium leading-none text-slate-900 focus:border-unb-red focus:outline-none focus:ring-2 focus:ring-unb-red/25"
                  />
                </>
              )}
            </div>
          </div>
          {scenarioApplyError ? (
            <p className="text-sm mb-2 text-amber-800" role="alert">
              {scenarioApplyError}
            </p>
          ) : null}
          <ParkingMap
            earthEngineTileUrl={tileUrl}
            sectionsGeoJSON={sectionsWithLotNames}
            lots={lots}
            onSectionClick={(lotId) => navigate(`/lot/${lotId}`)}
            mapDataMode={mapDataMode}
            scenarioDate={mapScenarioDate}
            scenarioTimeHHmm={mapScenarioTimeHHmm}
            scenarioLoading={scenarioApplying || dayPlanMapLoading}
            scenarioLoadingMessage={dayPlanMapLoading ? "Building your plan…" : undefined}
            nowcastingLiveApply={nowcastingLiveApply}
            scenarioPlay={
              showScenarioPlayControl
                ? {
                    show: true,
                    paused: simPaused,
                    onToggle: () => void toggleScenarioSimulation(),
                  }
                : null
            }
            className="h-[480px]"
          >
            {statsOverlay}
          </ParkingMap>
        </section>
      </div>

      <Outlet context={homeOutletContext} />
    </div>
  );
}

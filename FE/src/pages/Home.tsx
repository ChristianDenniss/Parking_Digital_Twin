import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ParkingMap } from "../components/ParkingMap";
import type {
  Building,
  ParkingLotWithDistance,
  PredictionMode,
  SimulatorState,
} from "../api/types";

function todayLocalYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeNowHHmm() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function percent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function meters(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)} m`;
}

export function HomeIndexContent() {
  return <Home />;
}

export function Home() {
  const navigate = useNavigate();

  const [lots, setLots] = useState<ParkingLotWithDistance[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [predictionMode, setPredictionMode] = useState<PredictionMode>("live");

  const [simulatorState, setSimulatorState] = useState<SimulatorState | null>(
    null
  );

  const [scenarioDate, setScenarioDate] = useState(todayLocalYmd());
  const [scenarioTime, setScenarioTime] = useState(timeNowHHmm());

  const [earthEngineTileUrl, setEarthEngineTileUrl] = useState<string | null>(
    null
  );
  const [sectionsGeoJson, setSectionsGeoJson] = useState<object | null>(null);

  const [loadingLots, setLoadingLots] = useState(false);
  const [loadingMap, setLoadingMap] = useState(false);
  const [error, setError] = useState("");

  const mapMode = predictionMode === "live" ? "live" : "pick-time";

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId]
  );

  async function loadBuildings() {
    try {
      const data = await api.getBuildings();
      setBuildings(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSimulatorState() {
    try {
      const state = await api.getSimulatorState();
      setSimulatorState(state);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadMapData() {
    try {
      setLoadingMap(true);

      try {
        const mapIdRes = await api.get<{
          tileUrl?: string;
          url?: string;
          mapid?: string;
          token?: string;
        }>("/api/earth-engine/mapid?asset=unbsj");

        if (mapIdRes?.tileUrl) {
          setEarthEngineTileUrl(mapIdRes.tileUrl);
        } else if (mapIdRes?.url) {
          setEarthEngineTileUrl(mapIdRes.url);
        } else if (mapIdRes?.mapid && mapIdRes?.token) {
          setEarthEngineTileUrl(
            `https://earthengine.googleapis.com/map/${mapIdRes.mapid}/{z}/{x}/{y}?token=${mapIdRes.token}`
          );
        }
      } catch (err) {
        console.warn("Map tiles unavailable:", err);
        setEarthEngineTileUrl(null);
      }

      try {
        const geo = await api.get<object>("/api/earth-engine/sections");
        setSectionsGeoJson(geo);
      } catch (err) {
        console.warn("Sections GeoJSON unavailable:", err);
        setSectionsGeoJson(null);
      }
    } finally {
      setLoadingMap(false);
    }
  }

  async function loadLots() {
    try {
      setLoadingLots(true);
      setError("");

      if (predictionMode === "live") {
        const data = await api.getLots(selectedBuildingId || undefined);
        setLots(data);
      } else {
        const data = await api.getPredictedLots({
          buildingId: selectedBuildingId || undefined,
          predictionMode,
          date: scenarioDate,
          time: scenarioTime,
        });
        setLots(data);
      }
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load parking lots.");
      }
    } finally {
      setLoadingLots(false);
    }
  }

  useEffect(() => {
    loadBuildings();
    loadSimulatorState();
    loadMapData();
  }, []);

  useEffect(() => {
    loadLots();
  }, [selectedBuildingId, predictionMode]);

  async function handleApplyScenario() {
    try {
      setError("");
      setLoadingMap(true);
      const state = await api.applyScenario(scenarioDate, scenarioTime);
      setSimulatorState(state);
      await loadLots();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof ApiError ? err.message : "Failed to apply scenario."
      );
    } finally {
      setLoadingMap(false);
    }
  }

  async function handleApplyLive() {
    try {
      setError("");
      setLoadingMap(true);
      const state = await api.applyLive();
      setSimulatorState(state);
      setPredictionMode("live");
      await loadLots();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof ApiError ? err.message : "Failed to switch to live mode."
      );
    } finally {
      setLoadingMap(false);
    }
  }

  async function handleTogglePlayPause() {
    if (!simulatorState) return;

    try {
      const nextPaused = !simulatorState.paused;
      const state = await api.toggleSimulationPause(nextPaused);
      setSimulatorState(state);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to update simulator state."
      );
    }
  }

  function handleSectionClick(lotId: string) {
    navigate(`/lot/${lotId}`);
  }

  return (
    <main className="px-[clamp(1.5rem,6vw,5rem)] py-8 space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                UNB Parking Digital Twin
              </h1>
              <p className="mt-2 text-slate-600 max-w-2xl leading-7">
                Explore live and scenario-based parking availability across
                campus, compare lots by walking distance, and prepare for future
                parking demand under normal, weekend, and event conditions.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/what-if")}
              className="rounded-full bg-unb-red px-5 py-2.5 text-white font-medium hover:opacity-95"
            >
              Open What-If Planner
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Destination building
              </span>
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red"
              >
                <option value="">All buildings</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                    {building.code ? ` (${building.code})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Mode
              </span>
              <select
                value={predictionMode}
                onChange={(e) =>
                  setPredictionMode(e.target.value as PredictionMode)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red"
              >
                <option value="live">Live</option>
                <option value="weekday">Weekday prediction</option>
                <option value="weekend">Weekend prediction</option>
                <option value="small_event">Small event</option>
                <option value="medium_event">Medium event</option>
                <option value="large_event">Large event</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Scenario date
              </span>
              <input
                type="date"
                value={scenarioDate}
                onChange={(e) => setScenarioDate(e.target.value)}
                disabled={predictionMode === "live"}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red disabled:bg-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Scenario time
              </span>
              <input
                type="time"
                value={scenarioTime}
                onChange={(e) => setScenarioTime(e.target.value)}
                disabled={predictionMode === "live"}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red disabled:bg-slate-100"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleApplyScenario}
              disabled={predictionMode === "live"}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Apply scenario
            </button>

            <button
              type="button"
              onClick={handleApplyLive}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Return to live
            </button>

            <button
              type="button"
              onClick={() => navigate("/predictions")}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              View predictions page
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Current selection
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Building</dt>
              <dd className="text-right font-medium text-slate-900">
                {selectedBuilding
                  ? `${selectedBuilding.name}${
                      selectedBuilding.code ? ` (${selectedBuilding.code})` : ""
                    }`
                  : "All campus lots"}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Mode</dt>
              <dd className="text-right font-medium text-slate-900">
                {predictionMode === "live"
                  ? "Live now"
                  : predictionMode.replaceAll("_", " ")}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Scenario date</dt>
              <dd className="text-right font-medium text-slate-900">
                {predictionMode === "live" ? "—" : scenarioDate}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Scenario time</dt>
              <dd className="text-right font-medium text-slate-900">
                {predictionMode === "live" ? "—" : scenarioTime}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Lots shown</dt>
              <dd className="text-right font-medium text-slate-900">
                {loadingLots ? "Loading..." : lots.length}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Simulation status</dt>
              <dd className="text-right font-medium text-slate-900">
                {simulatorState
                  ? simulatorState.paused
                    ? "Paused"
                    : "Running"
                  : "Unavailable"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <ParkingMap
            earthEngineTileUrl={earthEngineTileUrl}
            sectionsGeoJSON={sectionsGeoJson}
            lots={lots}
            onSectionClick={handleSectionClick}
            mapDataMode={mapMode}
            scenarioDate={scenarioDate}
            scenarioTimeHHmm={scenarioTime}
            scenarioLoading={loadingMap}
            scenarioPlay={{
              show: predictionMode !== "live",
              paused: simulatorState?.paused ?? true,
              disabled: !simulatorState,
              onToggle: handleTogglePlayPause,
            }}
            className="h-[520px]"
          >
            <div className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Map summary
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Click a parking section to open its lot details.
              </p>
            </div>
          </ParkingMap>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Best lots right now
            </h2>
            <button
              type="button"
              onClick={loadLots}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {loadingLots ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading lots...
              </div>
            ) : lots.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No lots found for the current selection.
              </div>
            ) : (
              lots.slice(0, 6).map((lot) => (
                <button
                  key={lot.id}
                  type="button"
                  onClick={() => navigate(`/lot/${lot.id}`)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-left px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {lot.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Capacity: {lot.capacity}
                      </p>
                      {lot.category ? (
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                          {lot.category}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right text-sm">
                      <div className="font-semibold text-slate-900">
                        {typeof lot.freeSpots === "number"
                          ? `${lot.freeSpots} free`
                          : "—"}
                      </div>
                      <div className="mt-1 text-slate-600">
                        {percent(lot.occupancyPercent)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                    <span>Walk distance</span>
                    <span className="font-medium text-slate-800">
                      {meters(lot.distanceMeters)}
                    </span>
                  </div>

                  {typeof lot.predictedFreeSpots === "number" ||
                  typeof lot.predictedOccupancyPercent === "number" ? (
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                      <span>Predicted</span>
                      <span className="font-medium text-slate-800">
                        {typeof lot.predictedFreeSpots === "number"
                          ? `${lot.predictedFreeSpots} free`
                          : percent(lot.predictedOccupancyPercent)}
                      </span>
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

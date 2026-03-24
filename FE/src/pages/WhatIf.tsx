import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type {
  Building,
  DayArrivalPlanResponse,
  PredictionMode,
  WhatIfScenarioRequest,
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

function formatMeters(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)} m`;
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function formatMinutes(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)} min`;
}

function prettifyPredictionMode(mode: PredictionMode) {
  return mode.replaceAll("_", " ");
}

export function WhatIf() {
  const navigate = useNavigate();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);

  const [arrivalDate, setArrivalDate] = useState(todayLocalYmd());
  const [arrivalTime, setArrivalTime] = useState(timeNowHHmm());
  const [buildingId, setBuildingId] = useState("");

  const [predictionMode, setPredictionMode] =
    useState<PredictionMode>("weekday");

  const [resident, setResident] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [preferClosest, setPreferClosest] = useState(true);
  const [preferAvailability, setPreferAvailability] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DayArrivalPlanResponse | null>(null);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === buildingId) ?? null,
    [buildings, buildingId]
  );

  useEffect(() => {
    async function loadBuildings() {
      try {
        setLoadingBuildings(true);
        const data = await api.getBuildings();
        setBuildings(data);
        if (data.length > 0 && !buildingId) {
          setBuildingId(data[0].id);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load buildings.");
      } finally {
        setLoadingBuildings(false);
      }
    }

    loadBuildings();
  }, []);

  function handleClosestChange(next: boolean) {
    setPreferClosest(next);
    if (next) setPreferAvailability(false);
  }

  function handleAvailabilityChange(next: boolean) {
    setPreferAvailability(next);
    if (next) setPreferClosest(false);
  }

  async function handleRunScenario() {
    if (!buildingId) {
      setError("Please select a destination building.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const payload: WhatIfScenarioRequest = {
        arrivalTime: `${arrivalDate}T${arrivalTime}`,
        buildingId,
        predictionMode,
        resident,
        disabled,
        preferClosest,
        preferAvailability,
      };

      const data = await api.getWhatIfRecommendation(payload);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to run the what-if scenario."
      );
    } finally {
      setLoading(false);
    }
  }

  const firstParkingSegment = useMemo(() => {
    if (!result) return null;

    return (
      result.segments.find(
        (segment) =>
          segment.type === "initial_arrival" ||
          segment.type === "return_and_park"
      ) ?? null
    );
  }, [result]);

  return (
    <main className="px-[clamp(1.5rem,6vw,5rem)] py-8 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mb-3 text-sm font-medium text-unb-red hover:underline"
            >
              ← Back to home
            </button>

            <h1 className="text-3xl font-bold text-slate-900">
              What-If Scenario Planner
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600 leading-7">
              Test parking recommendations before you arrive on campus. Change
              building, time, resident status, accessibility, and prediction
              mode to see how the recommended lot and parking plan changes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/predictions")}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            View predictions page
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Scenario inputs
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Destination building
              </span>
              <select
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                disabled={loadingBuildings}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red disabled:bg-slate-100"
              >
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
                Prediction mode
              </span>
              <select
                value={predictionMode}
                onChange={(e) =>
                  setPredictionMode(e.target.value as PredictionMode)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm capitalize outline-none focus:border-unb-red"
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
                Arrival date
              </span>
              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Arrival time
              </span>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-unb-red"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={resident}
                onChange={(e) => setResident(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-slate-800">
                I am a resident student
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-slate-800">
                I need accessible parking
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={preferClosest}
                onChange={(e) => handleClosestChange(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-slate-800">
                Prefer shortest walk
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={preferAvailability}
                onChange={(e) => handleAvailabilityChange(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-slate-800">
                Prefer highest availability
              </span>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRunScenario}
              disabled={loading || loadingBuildings}
              className="rounded-full bg-unb-red px-5 py-2.5 text-white font-medium hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Running scenario..." : "Run what-if scenario"}
            </button>

            <button
              type="button"
              onClick={() => {
                setArrivalDate(todayLocalYmd());
                setArrivalTime(timeNowHHmm());
                setPredictionMode("weekday");
                setResident(false);
                setDisabled(false);
                setPreferClosest(true);
                setPreferAvailability(false);
                setResult(null);
                setError("");
              }}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Scenario summary
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Building</dt>
              <dd className="text-right font-medium text-slate-900">
                {selectedBuilding
                  ? `${selectedBuilding.name}${
                      selectedBuilding.code ? ` (${selectedBuilding.code})` : ""
                    }`
                  : "—"}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Mode</dt>
              <dd className="text-right font-medium text-slate-900 capitalize">
                {prettifyPredictionMode(predictionMode)}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Arrival</dt>
              <dd className="text-right font-medium text-slate-900">
                {arrivalDate} {arrivalTime}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Resident</dt>
              <dd className="text-right font-medium text-slate-900">
                {resident ? "Yes" : "No"}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Accessible parking</dt>
              <dd className="text-right font-medium text-slate-900">
                {disabled ? "Yes" : "No"}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Preference</dt>
              <dd className="text-right font-medium text-slate-900">
                {preferClosest
                  ? "Shortest walk"
                  : preferAvailability
                  ? "Highest availability"
                  : "Balanced"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">
            Recommendation result
          </h2>
          {result ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              Scenario ready
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              No scenario yet
            </span>
          )}
        </div>

        {!result ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Run a what-if scenario to see the recommended parking plan.
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {firstParkingSegment &&
            "parking" in firstParkingSegment &&
            "timing" in firstParkingSegment ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Recommended lot
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {firstParkingSegment.parking.lot.name}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Recommended spot
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {firstParkingSegment.parking.spot.label}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Distance
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatMeters(firstParkingSegment.parking.distanceMeters)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Occupancy
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatPercent(firstParkingSegment.parking.occupancyPercent)}
                  </p>
                </div>
              </div>
            ) : null}

            {"assumptions" in result ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-slate-900">
                  Model assumptions
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Walking speed
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      {result.assumptions.walkMetersPerMinute} m/min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Minutes per floor
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      {formatMinutes(result.assumptions.minutesPerFloor)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Congestion model
                    </p>
                    <p className="mt-1 font-medium text-slate-900 capitalize">
                      {result.assumptions.congestionModel}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Plan segments
                </h3>
              </div>

              <div className="divide-y divide-slate-200">
                {result.segments.map((segment, index) => {
                  if (segment.type === "stay_on_campus") {
                    return (
                      <div key={index} className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">
                          Stay on campus
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Gap of {segment.gapMinutes} minutes between{" "}
                          {segment.previousClass.classCode} and{" "}
                          {segment.nextClass.classCode}.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 capitalize">
                            {segment.type.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Class: {segment.targetClass.classCode}
                            {segment.targetClass.courseName
                              ? ` — ${segment.targetClass.courseName}`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Building: {segment.building.name}
                            {segment.building.code
                              ? ` (${segment.building.code})`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Lot: {segment.parking.lot.name} | Spot:{" "}
                            {segment.parking.spot.label}
                          </p>
                        </div>

                        <div className="grid gap-2 text-sm lg:min-w-[260px]">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Arrive by
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {segment.timing.recommendedArriveBy}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Travel time
                            </p>
                            <p className="mt-1 font-medium text-slate-900">
                              {formatMinutes(segment.timing.totalTravelMinutes)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useOutletContext } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";
import { api } from "../api/client";
import type {
  Building,
  DayArrivalPlanResponse,
  DayArrivalSegment,
  EventSize,
  ParkingLot,
  ParkingSpot,
  QuickRecommendResponse,
} from "../api/types";

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function spotLabel(spot: ParkingSpot): string {
  const label = spot.label?.trim() ? spot.label.trim() : `${spot.section} ${spot.row} #${spot.index}`;
  return spot.isAccessible ? `${label} ♿` : label;
}

/** Open lot heat map with a specific stall outlined (see LotDetail `?spot=`). */
function lotHeatMapHref(lotId: string, spotId: string): string {
  return `/lot/${lotId}?spot=${encodeURIComponent(spotId)}`;
}

export type LotSortOption = "most-free" | "highest-free-pct" | "biggest" | "smallest";

export type HomeOutletContextValue = {
  token: string | null;
  planDate: string;
  setPlanDate: (v: string) => void;
  sortedByLot: Array<{
    lot: ParkingLot;
    total: number;
    occupied: number;
    empty: number;
    occupancyPercent: number;
    freePercent: number;
  }>;
  lotSort: LotSortOption;
  setLotSort: (v: LotSortOption) => void;
  navigate: NavigateFunction;
  /**
   * Day parking plan: switch map to Pick time, set simulator to scenario + paused, apply snapshot (deterministic).
   */
  applyPlanPausedScenario: (dateYmd: string, timeHHmm: string) => Promise<void>;
  /** Same as above but no-op if this scenario is already applied (avoids redundant apply on navigation). */
  applyPlanScenarioIfChanged: (dateYmd: string, timeHHmm: string) => Promise<void>;
  /** Shows map spinner + message while fetching the day plan and applying its scenario. */
  setDayPlanMapLoading: (loading: boolean) => void;
  /** Scroll the campus map into view (e.g. after clicking a plan step so loading is visible). */
  scrollCampusMapIntoView: () => void;
};

const DAY_PLAN_CACHE_PREFIX = "dt_day_plan_v1";

function dayPlanCacheKey(token: string, planDateYmd: string): string {
  return `${DAY_PLAN_CACHE_PREFIX}:${token.slice(0, 16)}:${planDateYmd}`;
}

const HOME_LOT_CARD_CLASS =
  "w-full text-left rounded border border-slate-200 bg-white py-2 px-3 flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-0.5 transition-all duration-200 hover:scale-[1.02] hover:bg-unb-red/5 hover:border-unb-red/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-unb-red focus-visible:ring-offset-1 cursor-pointer";

/** Tailwind text color class for % full (occupancy) on lot cards. */
function getOccupancyColorClass(pct: number): string {
  if (pct >= 95) return "text-red-900 font-semibold";   // Essentially full
  if (pct >= 85) return "text-red-600 font-medium";     // Very high congestion
  if (pct >= 75) return "text-orange-600 font-medium";  // Filling fast
  if (pct >= 60) return "text-yellow-600 font-medium";  // Moderate
  if (pct >= 40) return "text-green-400 font-medium";   // Plenty available
  return "text-green-800 font-medium";                  // Very open (< 40%)
}

function DayParkingPlanCard(props: {
  token: string | null;
  planDate: string;
  onPlanDateChange: (v: string) => void;
  applyPlanScenarioIfChanged: (dateYmd: string, timeHHmm: string) => Promise<void>;
  setDayPlanMapLoading: (loading: boolean) => void;
  scrollCampusMapIntoView: () => void;
  navigate: NavigateFunction;
}) {
  const {
    token,
    planDate,
    onPlanDateChange,
    applyPlanScenarioIfChanged,
    setDayPlanMapLoading,
    scrollCampusMapIntoView,
    navigate,
  } = props;
  const [plan, setPlan] = useState<DayArrivalPlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const applyIfChangedRef = useRef(applyPlanScenarioIfChanged);
  applyIfChangedRef.current = applyPlanScenarioIfChanged;

  const loadPlan = useCallback(
    (opts?: { force?: boolean }) => {
      if (!token) {
        setPlan(null);
        setPlanError(null);
        setPlanLoading(false);
        setDayPlanMapLoading(false);
        return;
      }
      if (!planDate.trim()) {
        setPlan(null);
        setPlanError(null);
        setPlanLoading(false);
        setDayPlanMapLoading(false);
        return;
      }

      if (!opts?.force && typeof sessionStorage !== "undefined") {
        try {
          const raw = sessionStorage.getItem(dayPlanCacheKey(token, planDate));
          if (raw) {
            const data = JSON.parse(raw) as DayArrivalPlanResponse;
            if (data.selectedDate === planDate) {
              setPlan(data);
              setPlanError(null);
              setPlanLoading(false);
              setDayPlanMapLoading(false);
              return;
            }
          }
        } catch {
          /* fetch fresh */
        }
      }

      setPlanLoading(true);
      setPlanError(null);
      setDayPlanMapLoading(true);
      const q = new URLSearchParams({ date: planDate });
      void (async () => {
        try {
          const data = await api.get<DayArrivalPlanResponse>(`/api/users/me/arrival-recommendation?${q}`, token);
          try {
            sessionStorage.setItem(dayPlanCacheKey(token, planDate), JSON.stringify(data));
          } catch {
            /* quota / private mode */
          }
          const initial = data.segments.find((s) => s.type === "initial_arrival");
          if (initial && initial.type === "initial_arrival") {
            const { dateYmd, timeHHmm } = initial.occupancyScenario;
            if (dateYmd?.trim() && timeHHmm?.trim()) {
              await applyIfChangedRef.current(dateYmd, timeHHmm);
            }
          }
          setPlan(data);
        } catch (e: unknown) {
          setPlan(null);
          setPlanError(e instanceof Error ? e.message : "Could not load plan");
        } finally {
          setPlanLoading(false);
          setDayPlanMapLoading(false);
        }
      })();
    },
    [token, planDate, setDayPlanMapLoading]
  );

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const openParkingStep = (href: string, os: { dateYmd: string; timeHHmm: string }) => {
    scrollCampusMapIntoView();
    void (async () => {
      await applyPlanScenarioIfChanged(os.dateYmd, os.timeHHmm);
      navigate(href);
    })();
  };

  const renderSegment = (seg: DayArrivalSegment, i: number) => {
    if (seg.type === "initial_arrival") {
      const c = seg.targetClass;
      return (
        <li key={i}>
          <Link
            to={lotHeatMapHref(seg.parking.lot.id, seg.parking.spot.id)}
            onClick={(e) => {
              e.preventDefault();
              if (!seg.occupancyScenario?.dateYmd || !seg.occupancyScenario?.timeHHmm) return;
              openParkingStep(
                lotHeatMapHref(seg.parking.lot.id, seg.parking.spot.id),
                seg.occupancyScenario
              );
            }}
            className="block rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-2 transition-colors hover:border-unb-red/50 hover:bg-white focus-visible:outline focus-visible:ring-2 focus-visible:ring-unb-red focus-visible:ring-offset-2"
            aria-label={`Open ${seg.parking.lot.name} map and highlight spot ${spotLabel(seg.parking.spot)}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-unb-red">
              Initial arrival (class {c.classIndex})
            </p>
            <p className="font-medium text-slate-900">
              Arrive by{" "}
              <span className="text-unb-red">{formatLocalTime(seg.timing.recommendedArriveBy)}</span>{" "}
              local time
            </p>
            <p className="text-sm text-slate-700">
              Park in <strong>{seg.parking.lot.name}</strong>, spot{" "}
              <strong>{spotLabel(seg.parking.spot)}</strong> (~{Math.round(seg.parking.distanceMeters)} m
              walk to {seg.building.name}
              {c.room ? `, room ${c.room}` : ""}).
            </p>
            <p className="text-sm text-slate-600">
              {c.classCode}
              {c.courseName ? ` - ${c.courseName}` : ""} starts at {formatLocalTime(c.startsAt)}.
            </p>
          </Link>
        </li>
      );
    }
    if (seg.type === "stay_on_campus") {
      return (
        <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Between classes
          </p>
          <p className="text-sm text-slate-800">
            <strong>Stay on campus</strong> between{" "}
            <span className="font-medium">{seg.previousClass.classCode}</span> (ends ~{" "}
            {formatLocalTime(seg.previousEndsAt)}) and{" "}
            <span className="font-medium">{seg.nextClass.classCode}</span> (starts{" "}
            {formatLocalTime(seg.nextStartsAt)}). Gap ≈ {seg.gapMinutes} minutes; under{" "}
            {plan?.gapMinutesAssumeLeftCampus ?? 60} minutes, so no new parking actions are assumed.
          </p>
        </li>
      );
    }
    const c = seg.targetClass;
      return (
        <li key={i}>
          <Link
            to={lotHeatMapHref(seg.parking.lot.id, seg.parking.spot.id)}
            onClick={(e) => {
              e.preventDefault();
              if (!seg.occupancyScenario?.dateYmd || !seg.occupancyScenario?.timeHHmm) return;
              openParkingStep(
                lotHeatMapHref(seg.parking.lot.id, seg.parking.spot.id),
                seg.occupancyScenario
              );
            }}
            className="block rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-2 transition-colors hover:border-amber-400 hover:bg-amber-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            aria-label={`Open ${seg.parking.lot.name} map and highlight spot ${spotLabel(seg.parking.spot)}`}
          >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Return &amp; park (class {c.classIndex})
          </p>
          <p className="text-sm text-slate-700">
            Long break (~{seg.gapAfterPreviousClassMinutes} min after your previous class). If you leave
            campus, <strong>return by</strong>{" "}
            <span className="text-unb-red font-semibold">
              {formatLocalTime(seg.timing.recommendedArriveBy)}
            </span>{" "}
            local time.
          </p>
          <p className="text-sm text-slate-700">
            Park in <strong>{seg.parking.lot.name}</strong>, spot{" "}
            <strong>{spotLabel(seg.parking.spot)}</strong> (~{Math.round(seg.parking.distanceMeters)} m to{" "}
            {seg.building.name}
            {c.room ? `, room ${c.room}` : ""}).
          </p>
          <p className="text-sm text-slate-600">
            {c.classCode}
            {c.courseName ? ` - ${c.courseName}` : ""} starts at {formatLocalTime(c.startsAt)}.
          </p>
        </Link>
      </li>
    );
  };

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
      aria-labelledby="day-parking-plan-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="day-parking-plan-heading" className="text-lg font-semibold text-slate-900">
            Your day parking plan
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Pick a date to load your plan. Only <strong>initial arrival</strong> and{" "}
            <strong>return &amp; park</strong> steps are clickable (they open the lot heat map with the suggested
            stall highlighted). <strong>Between classes</strong> / stay-on-campus blocks are informational only. Long
            gaps (&gt; 60 min, or the threshold shown below once loaded) assume you left campus and need to park
            again.
          </p>
        </div>
        {token ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600 flex items-center gap-2">
              Date
              <input
                type="date"
                value={planDate}
                onChange={(e) => onPlanDateChange(e.target.value)}
                className="rounded border border-slate-200 px-2 py-1.5 text-slate-800 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => loadPlan({ force: true })}
              disabled={planLoading || !planDate.trim()}
              className="rounded bg-unb-red text-white text-sm font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {planLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        ) : null}
      </div>

      {!token ? (
        <p className="text-sm text-slate-600">
          <Link to="/auth" className="text-unb-red font-medium underline underline-offset-2">
            Sign in
          </Link>{" "}
          with a linked student profile and schedule to see personalized recommendations.
        </p>
      ) : !planDate.trim() ? (
        <p className="text-sm text-slate-600 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center bg-slate-50/80">
          Select a date above to load your parking plan for that day.
        </p>
      ) : planLoading ? (
        <p className="text-sm text-slate-500">Building your plan…</p>
      ) : planError ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {planError}
        </p>
      ) : plan && plan.noClassesOnDay ? (
        <div className="border border-slate-200 rounded-lg px-4 py-5 bg-slate-50/80 space-y-1">
          <p className="text-sm font-medium text-slate-700">No classes scheduled on this day</p>
          <p className="text-xs text-slate-500">{plan.scheduleNote}</p>
        </div>
      ) : plan && plan.segments.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{plan.scheduleNote}</p>
          <ol className="space-y-3 list-none p-0 m-0">{plan.segments.map(renderSegment)}</ol>
          <p className="text-xs text-slate-400">
            Model: walk {plan.assumptions.walkMetersPerMinute} m/min,{" "}
            {plan.assumptions.minutesPerFloor} min/floor in-building; {plan.assumptions.congestionModel}.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No plan returned for this date.</p>
      )}
    </section>
  );
}

function occupancyBarClass(pct: number): string {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 75) return "bg-orange-400";
  if (pct >= 60) return "bg-yellow-400";
  return "bg-emerald-500";
}

function QuickRecommendCard({ token }: { token: string | null }) {
  const [open, setOpen] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [mode, setMode] = useState<"current" | "predicted">("current");
  const [eventSize, setEventSize] = useState<EventSize>("none");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickRecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && buildings.length === 0) {
      api.get<Building[]>("/api/buildings").then(setBuildings).catch(() => {});
    }
  }, [open, buildings.length]);

  const run = async () => {
    if (!buildingId) { setError("Please select a building."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const qs = new URLSearchParams({ buildingId, mode, eventSize }).toString();
      const data = await api.get<QuickRecommendResponse>(`/api/users/quick-recommend?${qs}`, token ?? undefined);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div>
          <p className="font-semibold text-slate-800">Find parking now</p>
          <p className="text-xs text-slate-500 mt-0.5">Get a spot recommendation for any building — live or forecast</p>
        </div>
        <span className="text-slate-400 text-lg select-none">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
          {/* Building selector */}
          <div className="pt-4 space-y-1">
            <label className="block text-sm font-medium text-slate-700">Building</label>
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            >
              <option value="">Select a building…</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Mode</label>
            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border-2 border-unb-red bg-white shadow-sm">
              {(["current", "predicted"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex items-center justify-center px-4 text-xs font-semibold transition-colors ${
                    mode === m ? "bg-unb-red text-white" : "text-slate-900 hover:bg-unb-red/5"
                  } ${m === "predicted" ? "border-l-2 border-unb-red" : ""}`}
                >
                  {m === "current" ? "Live" : "Forecast"}
                </button>
              ))}
            </div>
          </div>

          {/* Event size (forecast only) */}
          {mode === "predicted" && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Event on campus</label>
              <select
                value={eventSize}
                onChange={(e) => setEventSize(e.target.value as EventSize)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="none">No event</option>
                <option value="small">Small event</option>
                <option value="medium">Medium event</option>
                <option value="large">Large event</option>
              </select>
            </div>
          )}

          {!token && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded px-3 py-2">
              Log in to see lots matching your permit type.{" "}
              <Link to="/auth" className="text-unb-red underline">Sign in</Link>
            </p>
          )}

          <button
            type="button"
            onClick={() => void run()}
            disabled={loading || !buildingId}
            className="rounded-full bg-unb-red text-white text-sm px-5 py-2 font-medium hover:bg-unb-red/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Finding…" : "Find my spot"}
          </button>

          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

          {result && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 mt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{result.lot.name}</p>
                  <p className="text-xs text-slate-500">{result.lot.campus}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  result.confidence === "live"
                    ? "bg-emerald-100 text-emerald-700"
                    : result.confidence === "data-backed"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {result.confidence === "live" ? "Live" : result.confidence === "data-backed" ? "Data-backed" : "Curve estimate"}
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono font-medium text-slate-800">
                  {result.spot.label}{result.spot.isAccessible ? " ♿" : ""}
                </span>
                <span className="text-slate-500">· {result.distanceMeters}m · ~{result.walkMinutes} min walk</span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{result.freeSpotsInLot} free of {result.lot.capacity}</span>
                  <span className={getOccupancyColorClass(result.occupancyPct)}>{result.occupancyPct}% full</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${occupancyBarClass(result.occupancyPct)}`}
                    style={{ width: `${result.occupancyPct}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Nested under `CampusShell`; forwards outlet context from the shell to `HomeIndexContent` / `LotDetail`. */
export function Home() {
  const ctx = useOutletContext<HomeOutletContextValue>();
  return <Outlet context={ctx} />;
}

/** Index route only: plan card + per-lot list. */
export function HomeIndexContent() {
  const {
    token,
    planDate,
    setPlanDate,
    sortedByLot,
    lotSort,
    setLotSort,
    navigate,
    applyPlanScenarioIfChanged,
    setDayPlanMapLoading,
    scrollCampusMapIntoView,
  } = useOutletContext<HomeOutletContextValue>();

  const half = Math.ceil(sortedByLot.length / 2);
  const leftColumn = sortedByLot.slice(0, half);
  const rightColumn = sortedByLot.slice(half);

  return (
    <>
      <DayParkingPlanCard
        token={token}
        planDate={planDate}
        onPlanDateChange={setPlanDate}
        applyPlanScenarioIfChanged={applyPlanScenarioIfChanged}
        setDayPlanMapLoading={setDayPlanMapLoading}
        scrollCampusMapIntoView={scrollCampusMapIntoView}
        navigate={navigate}
      />

      <QuickRecommendCard token={token} />

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold">By individual lot</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Total and occupancy % per lot (subsection of campus).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Sort by
            <select
              value={lotSort}
              onChange={(e) => setLotSort(e.target.value as LotSortOption)}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-800 text-sm"
            >
              <option value="most-free">Most free spots</option>
              <option value="highest-free-pct">Highest free %</option>
              <option value="biggest">Biggest</option>
              <option value="smallest">Smallest</option>
            </select>
          </label>
        </div>
        {sortedByLot.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No lots found. Did you run <code>npm run seed</code> in the backend?
          </p>
        ) : (
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              {leftColumn.map(({ lot, total, occupied, empty, occupancyPercent }) => (
                <button
                  type="button"
                  key={lot.id}
                  onClick={() => navigate(`/lot/${lot.id}`)}
                  className={HOME_LOT_CARD_CLASS}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-sm truncate">{lot.name}</p>
                    <span className="text-xs text-slate-500 shrink-0">{lot.campus}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs">
                    <span className="text-slate-600">Total: {total}</span>
                    <span className="text-emerald-600">Free: {empty}</span>
                    <span className="text-red-600">Taken: {occupied}</span>
                    <span className={getOccupancyColorClass(occupancyPercent)}>{occupancyPercent}%</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {rightColumn.map(({ lot, total, occupied, empty, occupancyPercent }) => (
                <button
                  type="button"
                  key={lot.id}
                  onClick={() => navigate(`/lot/${lot.id}`)}
                  className={HOME_LOT_CARD_CLASS}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-sm truncate">{lot.name}</p>
                    <span className="text-xs text-slate-500 shrink-0">{lot.campus}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs">
                    <span className="text-slate-600">Total: {total}</span>
                    <span className="text-emerald-600">Free: {empty}</span>
                    <span className="text-red-600">Taken: {occupied}</span>
                    <span className={getOccupancyColorClass(occupancyPercent)}>{occupancyPercent}%</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

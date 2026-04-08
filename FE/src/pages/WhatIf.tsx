import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { DayArrivalPlanResponse, DayArrivalSegment, EventSize, ParkingSpot } from "../api/types";

const tokenKey = "parking_twin_token";

interface WhatIfLot {
  lotId: string;
  lotName: string;
  lotType: string;
  baseline: { occupancyPct: number; freeSpots: number; confidence: string };
  scenario: { occupancyPct: number; freeSpots: number; confidence: string };
  delta: { occupancyPct: number; freeSpots: number };
}

interface WhatIfResponse {
  date: string;
  time: string;
  dayOfWeek: string;
  eventSize: EventSize;
  useEnrollment: boolean;
  lots: WhatIfLot[];
  summary: {
    totalBaselineFreeSpots: number;
    totalScenarioFreeSpots: number;
    totalCapacity: number;
    baselineOccupancyPct: number;
    scenarioOccupancyPct: number;
  };
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowHHMM(): string {
  return `${String(new Date().getHours()).padStart(2, "0")}:00`;
}

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function spotLabelWhatIf(spot: ParkingSpot): string {
  const label = spot.label?.trim() ? spot.label.trim() : `${spot.section} ${spot.row} #${spot.index}`;
  return spot.isAccessible ? `${label} (accessible)` : label;
}

function lotHeatMapHref(lotId: string, spotId: string): string {
  return `/lot/${lotId}?spot=${encodeURIComponent(spotId)}`;
}

type ParkingArrivalSeg = Extract<DayArrivalSegment, { type: "initial_arrival" } | { type: "return_and_park" }>;

function isParkingStep(seg: DayArrivalSegment): seg is ParkingArrivalSeg {
  return seg.type === "initial_arrival" || seg.type === "return_and_park";
}

/** Positive when scenario asks you to be parked earlier than baseline (same calendar instant). */
function recommendedDeltaMinutesEarlierScenarioVsBaseline(scenarioIso: string, baselineIso: string): number {
  const s = new Date(scenarioIso).getTime();
  const b = new Date(baselineIso).getTime();
  if (Number.isNaN(s) || Number.isNaN(b)) return 0;
  return Math.round((b - s) / 60000);
}

function segmentsAlignForCompare(a: DayArrivalSegment[], b: DayArrivalSegment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.type !== b[i]!.type) return false;
  }
  return true;
}

/** Percent values in the campus scenario table: max 4 decimal places for display. */
function roundPct4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function formatPct4(n: number): string {
  const v = roundPct4(n);
  return v.toFixed(4).replace(/\.?0+$/, "") || "0";
}

function OccBar({ pct, color }: { pct: number; color: string }) {
  const w = Math.min(roundPct4(pct), 100);
  return (
    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-0.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const d = roundPct4(delta);
  if (d === 0) return <span className="text-slate-400">No change</span>;
  const positive = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-unb-red" : "text-emerald-600"}`}>
      {positive ? "▲" : "▼"} {formatPct4(Math.abs(d))}%
    </span>
  );
}

/** UNB brand reds for occupancy bars (campus table + day plan). */
function occBarColor(pct: number) {
  if (pct >= 85) return "bg-unb-red";
  if (pct >= 75) return "bg-unb-red/75";
  if (pct >= 60) return "bg-unb-red/45";
  return "bg-emerald-500";
}

// ─── Shared controls component ────────────────────────────────────────────────
function ScenarioControls({
  date,
  setDate,
  time,
  setTime,
  eventSize,
  setEventSize,
  showArrivalTime = true,
  children,
}: {
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  eventSize: EventSize;
  setEventSize: (v: EventSize) => void;
  /** My scenario uses class start times from your schedule; hide the free-form arrival time. */
  showArrivalTime?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div
        className={`grid gap-4 ${showArrivalTime ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/40"
          />
        </div>
        {showArrivalTime ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Arrival time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/40"
            />
          </div>
        ) : null}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Event on campus</label>
          <select
            value={eventSize}
            onChange={(e) => setEventSize(e.target.value as EventSize)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/40"
          >
            <option value="none">No event</option>
            <option value="small">Small (+10%)</option>
            <option value="medium">Medium (+22%)</option>
            <option value="large">Large (+38%)</option>
          </select>
        </div>
      </div>
      {!showArrivalTime ? (
        <p className="text-xs text-slate-500">
          Arrival and forecast times follow your class start times on that day (same model as Home).
        </p>
      ) : null}
      {children}
    </div>
  );
}

function ParkingStepOccRow({ free, capacity, pct }: { free: number; capacity: number; pct: number }) {
  return (
    <div className="space-y-1 pt-2 mt-2 border-t border-slate-200/80">
      <div className="flex justify-between text-xs text-slate-600">
        <span>
          {free} free in lot <span className="text-slate-400">({capacity} spaces)</span>
        </span>
        <span className={pct >= 75 ? "text-unb-red font-medium" : "text-slate-600"}>{pct}% full</span>
      </div>
      <OccBar pct={pct} color={occBarColor(pct)} />
    </div>
  );
}

function ParkingStepBody({ seg, arriveByLabel }: { seg: ParkingArrivalSeg; arriveByLabel: string }) {
  const c = seg.targetClass;
  return (
    <div className="space-y-2 text-left">
      <p className="font-medium text-slate-900">
        {arriveByLabel}{" "}
        <span className="text-unb-red tabular-nums">{formatLocalTime(seg.timing.recommendedArriveBy)}</span> local time
      </p>
      <p className="text-sm text-slate-700">
        <strong>{seg.parking.lot.name}</strong>, spot <strong>{spotLabelWhatIf(seg.parking.spot)}</strong> (~
        {Math.round(seg.parking.distanceMeters)} m to {seg.building.name}
        {c.room ? `, room ${c.room}` : ""}).
      </p>
      <ParkingStepOccRow
        free={seg.parking.freeSpotsInSelectedLot}
        capacity={seg.parking.lot.capacity}
        pct={seg.parking.occupancyPercent}
      />
    </div>
  );
}

function renderWhatIfPlanSegment(
  seg: DayArrivalSegment,
  i: number,
  gapMinutesAssumeLeftCampus: number,
  baselineSeg: DayArrivalSegment | null,
  compareMisaligned: boolean
) {
  if (seg.type === "stay_on_campus") {
    return (
      <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Between classes</p>
        <p className="text-sm text-slate-800">
          <strong>Stay on campus</strong> between <span className="font-medium">{seg.previousClass.classCode}</span> (ends
          ~{formatLocalTime(seg.previousEndsAt)}) and <span className="font-medium">{seg.nextClass.classCode}</span> (starts{" "}
          {formatLocalTime(seg.nextStartsAt)}). Gap ~{seg.gapMinutes} minutes; under {gapMinutesAssumeLeftCampus} minutes, so
          no new parking steps are assumed.
        </p>
      </li>
    );
  }

  if (!isParkingStep(seg)) return null;

  const c = seg.targetClass;
  const title =
    seg.type === "initial_arrival"
      ? `Initial arrival (class ${c.classIndex})`
      : `Return and park (class ${c.classIndex})`;
  const scenarioHref = lotHeatMapHref(seg.parking.lot.id, seg.parking.spot.id);

  if (!baselineSeg || !isParkingStep(baselineSeg) || compareMisaligned) {
    return (
      <li key={i}>
        <Link
          to={scenarioHref}
          className="block rounded-lg border border-unb-red/30 bg-unb-red/[0.07] p-4 space-y-2 transition-colors hover:border-unb-red/50 hover:bg-unb-red/[0.1] focus-visible:outline focus-visible:ring-2 focus-visible:ring-unb-red focus-visible:ring-offset-2"
          aria-label={`Open ${seg.parking.lot.name} map and highlight spot ${spotLabelWhatIf(seg.parking.spot)}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-unb-red">{title}</p>
          {seg.type === "return_and_park" ? (
            <p className="text-sm text-slate-600">
              Long break (~{seg.gapAfterPreviousClassMinutes} min after your previous class). If you leave campus, use the
              arrive-by time below.
            </p>
          ) : null}
          <ParkingStepBody seg={seg} arriveByLabel={seg.type === "initial_arrival" ? "Arrive by" : "Return by"} />
          <p className="text-sm text-slate-600">
            {c.classCode}
            {c.courseName ? ` - ${c.courseName}` : ""} starts at {formatLocalTime(c.startsAt)}.
          </p>
        </Link>
      </li>
    );
  }

  const base = baselineSeg;
  const lotChanged = seg.parking.lot.id !== base.parking.lot.id;
  const spotChanged = seg.parking.spot.id !== base.parking.spot.id;
  const deltaMin = recommendedDeltaMinutesEarlierScenarioVsBaseline(seg.timing.recommendedArriveBy, base.timing.recommendedArriveBy);
  const freeDropped = seg.parking.freeSpotsInSelectedLot < base.parking.freeSpotsInSelectedLot;
  const occRise = seg.parking.occupancyPercent > base.parking.occupancyPercent + 2;

  const baselineHref = lotHeatMapHref(base.parking.lot.id, base.parking.spot.id);

  return (
    <li key={i} className="rounded-lg border border-unb-red/30 bg-white overflow-hidden">
      <div className="bg-unb-red/[0.06] px-4 py-2 border-b border-unb-red/15">
        <p className="text-xs font-semibold uppercase tracking-wide text-unb-red">{title}</p>
        {seg.type === "return_and_park" ? (
          <p className="text-xs text-slate-600 mt-0.5">
            Long break (~{seg.gapAfterPreviousClassMinutes} min). Comparison uses the same class block on a normal day vs under
            the event.
          </p>
        ) : null}
      </div>

      <div className="p-4 space-y-3">
        <div className="rounded-md border border-slate-200 bg-slate-50/90 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Regular day (no event)</p>
          <ParkingStepBody seg={base} arriveByLabel={seg.type === "initial_arrival" ? "Arrive by" : "Return by"} />
          <Link
            to={baselineHref}
            className="inline-block text-xs font-medium text-unb-red hover:underline underline-offset-2"
          >
            Open lot map (regular plan stall)
          </Link>
        </div>

        <div className="rounded-md border border-unb-red/35 bg-unb-red/[0.05] p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-unb-red">With this event (what-if)</p>
          <ParkingStepBody seg={seg} arriveByLabel={seg.type === "initial_arrival" ? "Arrive by" : "Return by"} />
          <Link
            to={scenarioHref}
            className="inline-block text-xs font-medium text-unb-red hover:underline underline-offset-2"
          >
            Open lot map (event scenario stall)
          </Link>
        </div>

        <div className="rounded-md border border-unb-red/35 bg-unb-red/5 px-3 py-2.5 text-sm text-slate-800 space-y-1.5" role="status">
          {lotChanged ? (
            <p>
              <span className="font-semibold text-unb-red">Different lot.</span> Regular plan:{" "}
              <span className="font-medium">{base.parking.lot.name}</span>. Under the event:{" "}
              <span className="font-medium">{seg.parking.lot.name}</span>
              {spotChanged ? " and a different stall." : "."} Higher demand from the event likely displaced the usual pick.
            </p>
          ) : null}
          {deltaMin > 0 ? (
            <p>
              <span className="font-semibold text-unb-red">Earlier to be parked.</span> Target about{" "}
              <span className="font-semibold tabular-nums">{deltaMin}</span> minute{deltaMin === 1 ? "" : "s"} sooner with the
              event: <span className="tabular-nums">{formatLocalTime(seg.timing.recommendedArriveBy)}</span> instead of{" "}
              <span className="tabular-nums">{formatLocalTime(base.timing.recommendedArriveBy)}</span> local time.
            </p>
          ) : null}
          {deltaMin < 0 ? (
            <p>
              <span className="font-semibold text-unb-red">Later arrive-by.</span> The model suggests about{" "}
              <span className="font-semibold tabular-nums">{Math.abs(deltaMin)}</span> minute{Math.abs(deltaMin) === 1 ? "" : "s"}{" "}
              later with the event ({formatLocalTime(seg.timing.recommendedArriveBy)} vs{" "}
              {formatLocalTime(base.timing.recommendedArriveBy)} local time). Still verify against your class time.
            </p>
          ) : null}
          {!lotChanged && deltaMin === 0 ? (
            <p>
              <span className="font-semibold text-unb-red">Same lot and same arrive-by window.</span> The event still changes
              forecasted fullness below.
            </p>
          ) : null}
          {freeDropped || occRise ? (
            <p className="text-slate-700">
              Forecast in this lot: <span className="tabular-nums">{base.parking.freeSpotsInSelectedLot}</span> free (
              {base.parking.occupancyPercent}% full) on a regular day vs{" "}
              <span className="tabular-nums">{seg.parking.freeSpotsInSelectedLot}</span> free ({seg.parking.occupancyPercent}%
              full) under the event
              {freeDropped && seg.parking.freeSpotsInSelectedLot < 10 ? " (tight; add buffer)." : "."}
            </p>
          ) : null}
        </div>

        <p className="text-sm text-slate-600">
          {c.classCode}
          {c.courseName ? ` - ${c.courseName}` : ""} starts at {formatLocalTime(c.startsAt)}.
        </p>
      </div>
    </li>
  );
}

async function fetchArrivalPlanForWhatIf(date: string, eventSize: EventSize, token: string) {
  const q = new URLSearchParams({ date, stateMode: "predicted", eventSize });
  return api.get<DayArrivalPlanResponse>(`/api/users/me/arrival-recommendation?${q}`, token);
}

// ─── Campus View (original) ───────────────────────────────────────────────────
function CampusView({ token }: { token: string | null }) {
  const [date, setDate] = useState(todayYmd());
  const [time, setTime] = useState(nowHHMM());
  const [eventSize, setEventSize] = useState<EventSize>("none");
  const [useEnrollment, setUseEnrollment] = useState(true);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const q = new URLSearchParams({ date, time, eventSize, useEnrollment: String(useEnrollment) });
      const data = await api.get<WhatIfResponse>(`/api/what-if?${q}`, token ?? undefined);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setLoading(false); }
  };

  const showEvent = result && result.eventSize !== "none";

  return (
    <div className="space-y-4">
      <ScenarioControls date={date} setDate={setDate} time={time} setTime={setTime} eventSize={eventSize} setEventSize={setEventSize}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Enrollment weight</label>
            <button
              type="button"
              onClick={() => setUseEnrollment((v) => !v)}
              className={`inline-flex items-center justify-center h-8 min-w-[2.25rem] px-2 rounded-md text-xs font-semibold border transition-colors ${
                useEnrollment
                  ? "bg-unb-red text-white border-unb-red"
                  : "bg-white text-unb-red border-unb-red/40 hover:border-unb-red hover:bg-unb-red/5"
              }`}
            >
              {useEnrollment ? "On" : "Off"}
            </button>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="inline-flex items-center justify-center h-8 px-4 rounded-lg bg-unb-red text-white text-sm font-semibold hover:bg-unb-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Calculating…" : "Run scenario"}
          </button>
        </div>
      </ScenarioControls>

      {error && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Campus summary: {result.dayOfWeek}, {result.date} at {result.time}
              {showEvent ? ` · ${result.eventSize} event` : ""}
              {result.useEnrollment ? " · enrollment on" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div><p className="text-2xl font-bold text-slate-800">{result.summary.baselineOccupancyPct}%</p><p className="text-xs text-slate-500">Baseline occupancy</p></div>
              <div><p className={`text-2xl font-bold ${showEvent ? "text-unb-red" : "text-slate-800"}`}>{result.summary.scenarioOccupancyPct}%</p><p className="text-xs text-slate-500">Scenario occupancy</p></div>
              <div><p className="text-2xl font-bold text-slate-800">{result.summary.totalBaselineFreeSpots}</p><p className="text-xs text-slate-500">Baseline free spots</p></div>
              <div><p className={`text-2xl font-bold ${showEvent ? "text-unb-red" : "text-slate-800"}`}>{result.summary.totalScenarioFreeSpots}</p><p className="text-xs text-slate-500">Scenario free spots</p></div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Per-lot comparison</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100">
                    <th className="text-left px-5 py-2.5 font-medium">Lot</th>
                    <th className="text-right px-4 py-2.5 font-medium">Baseline</th>
                    <th className="text-right px-4 py-2.5 font-medium">Scenario</th>
                    <th className="text-right px-4 py-2.5 font-medium">Impact</th>
                    <th className="text-right px-5 py-2.5 font-medium">Free spots</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.lots.map((lot) => (
                    <tr key={lot.lotId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{lot.lotName}</p>
                        <p className="text-xs text-slate-400 capitalize">{lot.lotType.replace(/_/g, " ")}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-medium text-slate-700">{formatPct4(lot.baseline.occupancyPct)}%</p>
                        <OccBar pct={lot.baseline.occupancyPct} color="bg-slate-300" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className={`font-medium ${lot.scenario.occupancyPct > lot.baseline.occupancyPct ? "text-unb-red" : "text-slate-700"}`}>
                          {formatPct4(lot.scenario.occupancyPct)}%
                        </p>
                        <OccBar pct={lot.scenario.occupancyPct} color={occBarColor(lot.scenario.occupancyPct)} />
                      </td>
                      <td className="px-4 py-3 text-right"><DeltaBadge delta={lot.delta.occupancyPct} /></td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-medium ${lot.scenario.freeSpots < 5 ? "text-unb-red" : "text-slate-700"}`}>{lot.scenario.freeSpots}</span>
                        {lot.delta.freeSpots !== 0 && (
                          <span className={`ml-1 text-xs ${lot.delta.freeSpots < 0 ? "text-unb-red" : "text-emerald-600"}`}>
                            ({lot.delta.freeSpots > 0 ? "+" : ""}{lot.delta.freeSpots})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">
              Baseline = no event, no enrollment weighting · Scenario = your selected parameters
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── My scenario: same day parking plan as Home, with event size applied to predictions + compare alerts ───
function ScheduleWhatIf({ token }: { token: string | null }) {
  const [date, setDate] = useState(todayYmd());
  const [eventSize, setEventSize] = useState<EventSize>("none");
  const [plan, setPlan] = useState<DayArrivalPlanResponse | null>(null);
  const [baselinePlan, setBaselinePlan] = useState<DayArrivalPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
        <p className="text-slate-600 font-medium">Sign in to run this what-if</p>
        <p className="text-sm text-slate-500">
          Pick a date and an event size, then run. We load your regular predicted day plan and the same plan under that event so
          you can see lot changes, how much earlier to be parked, and tighter free-stall counts step by step.
        </p>
        <Link
          to="/auth"
          className="inline-flex items-center justify-center mt-2 px-4 py-2 rounded-lg bg-unb-red text-white text-sm font-semibold hover:bg-unb-red-dark transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const run = async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    setBaselinePlan(null);
    try {
      if (eventSize === "none") {
        const data = await fetchArrivalPlanForWhatIf(date, "none", token);
        setPlan(data);
        setBaselinePlan(null);
      } else {
        const [base, scenario] = await Promise.all([
          fetchArrivalPlanForWhatIf(date, "none", token),
          fetchArrivalPlanForWhatIf(date, eventSize, token),
        ]);
        setBaselinePlan(base);
        setPlan(scenario);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const compareMisaligned =
    eventSize !== "none" &&
    Boolean(
      baselinePlan &&
        plan &&
        !segmentsAlignForCompare(baselinePlan.segments, plan.segments)
    );

  const eventSizeLabel =
    eventSize === "small" ? "Small (+10%)" : eventSize === "medium" ? "Medium (+22%)" : eventSize === "large" ? "Large (+38%)" : null;

  return (
    <div className="space-y-4">
      <ScenarioControls
        date={date}
        setDate={setDate}
        time=""
        setTime={() => {}}
        eventSize={eventSize}
        setEventSize={setEventSize}
        showArrivalTime={false}
      >
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center justify-center h-8 px-4 rounded-lg bg-unb-red text-white text-sm font-semibold hover:bg-unb-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Loading…" : "Run my scenario"}
        </button>
      </ScenarioControls>

      {error ? (
        <p
          className="text-sm text-slate-800 bg-unb-red/5 border border-unb-red/35 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3" aria-busy="true">
          <span className="sr-only">Loading your day parking plan</span>
          <div className="skeleton h-5 w-56 max-w-full rounded" />
          <ol className="space-y-3 list-none p-0 m-0">
            {[0, 1].map((i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-2">
                <div className="skeleton h-3 w-40 max-w-[85%] rounded" />
                <div className="skeleton h-4 w-full max-w-md rounded" />
                <div className="skeleton h-3 w-full rounded" />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {!loading && plan ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              {eventSizeLabel ? "Regular plan vs event scenario" : "Your predicted day parking plan"}
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Predicted mode for <span className="font-medium text-slate-700">{plan.selectedDate}</span>.
              {eventSizeLabel ? (
                <>
                  {" "}
                  Event: <span className="font-medium text-unb-red">{eventSizeLabel}</span>. Each parking step below stacks{" "}
                  <span className="font-medium text-slate-700">no event</span> next to{" "}
                  <span className="font-medium text-unb-red">with event</span>, then spells out lot changes and how many minutes
                  earlier (or later) to be parked.
                </>
              ) : (
                <span> No campus event selected, so this is only the regular forecast. Add an event and run again to compare.</span>
              )}
            </p>
          </div>

          {compareMisaligned ? (
            <p className="text-sm text-slate-800 bg-unb-red/5 border border-unb-red/35 rounded-lg px-3 py-2.5" role="status">
              <span className="font-semibold text-unb-red">Could not line up steps.</span> The regular and event plans returned a
              different shape (segment count or order). Showing the event scenario only; try another date or event size if this
              persists.
            </p>
          ) : null}

          {plan.noClassesOnDay || plan.segments.length === 0 ? (
            <p className="text-sm text-slate-600 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center bg-slate-50/80">
              {plan.scheduleNote || "No plan segments for this date."}
            </p>
          ) : (
            <div className="space-y-3">
              {plan.scheduleNote ? <p className="text-xs text-slate-500">{plan.scheduleNote}</p> : null}
              <ol className="space-y-3 list-none p-0 m-0">
                {plan.segments.map((seg, i) =>
                  renderWhatIfPlanSegment(
                    seg,
                    i,
                    plan.gapMinutesAssumeLeftCampus,
                    eventSize !== "none" && baselinePlan && !compareMisaligned ? baselinePlan.segments[i] ?? null : null,
                    compareMisaligned
                  )
                )}
              </ol>
              <p className="text-xs text-slate-400">
                Model: walk {plan.assumptions.walkMetersPerMinute} m/min, {plan.assumptions.minutesPerFloor} min/floor
                in-building; {plan.assumptions.congestionModel}. Parking steps link to the lot map with the stall highlighted.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

// ─── Main WhatIf page ─────────────────────────────────────────────────────────
export function WhatIf() {
  const token = typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;
  const [activeTab, setActiveTab] = useState<"campus" | "personal">("campus");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">What-If Explorer</h1>
        <p className="text-sm text-slate-500 mt-1">
          Campus view compares lots campus-wide. My scenario contrasts your regular predicted day plan with the same plan under
          a campus event: lot moves, minutes earlier to park, and fuller lots.
          {!token ? " Sign in to use My scenario." : ""}
        </p>
      </div>

      {/* Tab switcher: matches Schedule / account tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(["campus", "personal"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-unb-red text-unb-red bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab === "campus" ? "Campus view" : "My scenario"}
            {tab === "personal" && !token && (
              <span className="rounded-md bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 font-medium">
                Login required
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "campus" ? <CampusView token={token} /> : <ScheduleWhatIf token={token} />}
    </div>
  );
}

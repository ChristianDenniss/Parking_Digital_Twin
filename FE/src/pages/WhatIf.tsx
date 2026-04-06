import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { EventSize } from "../api/types";

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

interface PersonalRecSide {
  lot: { id: string; name: string; capacity: number };
  spot: { id: string; label: string; isAccessible: boolean };
  distanceMeters: number;
  freeSpotsInLot: number;
  occupancyPct: number;
  walkMinutes: number;
}

interface PersonalWhatIfResponse {
  date: string;
  time: string;
  eventSize: EventSize;
  building: { id: string; name: string };
  baseline: PersonalRecSide | null;
  scenario: PersonalRecSide | null;
  lotChanged: boolean;
  spotsDroppedBelow10: boolean;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowHHMM(): string {
  return `${String(new Date().getHours()).padStart(2, "0")}:00`;
}

function OccBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-0.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-slate-400">—</span>;
  const positive = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-red-600" : "text-emerald-600"}`}>
      {positive ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

function occBarColor(pct: number) {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 75) return "bg-orange-400";
  if (pct >= 60) return "bg-amber-400";
  return "bg-emerald-400";
}

function PersonalRecCard({ label, rec, highlight }: { label: string; rec: PersonalRecSide | null; highlight?: boolean }) {
  if (!rec) {
    return (
      <div className={`rounded-xl border p-4 space-y-2 ${highlight ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-sm text-slate-500">No parking found for this scenario.</p>
      </div>
    );
  }
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${highlight ? "border-unb-red bg-red-50/40" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div>
        <p className="font-semibold text-slate-800">{rec.lot.name}</p>
        <p className="text-sm font-mono text-slate-700 mt-0.5">
          {rec.spot.label}{rec.spot.isAccessible ? " ♿" : ""}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{rec.distanceMeters}m · ~{rec.walkMinutes} min walk</p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-600">
          <span>{rec.freeSpotsInLot} free of {rec.lot.capacity}</span>
          <span className={rec.occupancyPct >= 75 ? "text-red-600 font-medium" : "text-slate-600"}>{rec.occupancyPct}% full</span>
        </div>
        <OccBar pct={rec.occupancyPct} color={occBarColor(rec.occupancyPct)} />
      </div>
    </div>
  );
}

// ─── Shared controls component ────────────────────────────────────────────────
function ScenarioControls({
  date, setDate, time, setTime, eventSize, setEventSize,
  children,
}: {
  date: string; setDate: (v: string) => void;
  time: string; setTime: (v: string) => void;
  eventSize: EventSize; setEventSize: (v: EventSize) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Arrival time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Event on campus</label>
          <select value={eventSize} onChange={(e) => setEventSize(e.target.value as EventSize)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/40">
            <option value="none">No event</option>
            <option value="small">Small (+10%)</option>
            <option value="medium">Medium (+22%)</option>
            <option value="large">Large (+38%)</option>
          </select>
        </div>
      </div>
      {children}
    </div>
  );
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
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Enrollment weight</label>
            <button type="button" onClick={() => setUseEnrollment((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${useEnrollment ? "bg-unb-red text-white border-unb-red" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
              {useEnrollment ? "On" : "Off"}
            </button>
          </div>
          <button type="button" onClick={run} disabled={loading}
            className="rounded-lg bg-unb-red text-white px-6 py-2.5 text-sm font-medium hover:bg-unb-red-dark disabled:opacity-50 transition-colors">
            {loading ? "Calculating…" : "Run scenario"}
          </button>
        </div>
      </ScenarioControls>

      {error && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
              Campus summary — {result.dayOfWeek}, {result.date} at {result.time}
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
                        <p className="font-medium text-slate-700">{lot.baseline.occupancyPct}%</p>
                        <OccBar pct={lot.baseline.occupancyPct} color="bg-slate-300" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className={`font-medium ${lot.scenario.occupancyPct > lot.baseline.occupancyPct ? "text-unb-red" : "text-slate-700"}`}>{lot.scenario.occupancyPct}%</p>
                        <OccBar pct={lot.scenario.occupancyPct} color={occBarColor(lot.scenario.occupancyPct)} />
                      </td>
                      <td className="px-4 py-3 text-right"><DeltaBadge delta={lot.delta.occupancyPct} /></td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-medium ${lot.scenario.freeSpots < 5 ? "text-red-600" : "text-slate-700"}`}>{lot.scenario.freeSpots}</span>
                        {lot.delta.freeSpots !== 0 && (
                          <span className={`ml-1 text-xs ${lot.delta.freeSpots < 0 ? "text-red-500" : "text-emerald-600"}`}>
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

// ─── Personal Scenario tab ────────────────────────────────────────────────────
function MyScenario({ token }: { token: string | null }) {
  const [date, setDate] = useState(todayYmd());
  const [time, setTime] = useState(nowHHMM());
  const [eventSize, setEventSize] = useState<EventSize>("none");
  const [result, setResult] = useState<PersonalWhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
        <p className="text-slate-600 font-medium">Log in to run your personal what-if</p>
        <p className="text-sm text-slate-500">
          See exactly which lot and spot you would get — with and without an event — based on your own schedule and permit type.
        </p>
        <Link to="/auth" className="inline-block mt-2 rounded-full bg-unb-red text-white text-sm px-6 py-2 font-medium hover:bg-unb-red/90">
          Sign in
        </Link>
      </div>
    );
  }

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const q = new URLSearchParams({ date, time, eventSize });
      const data = await api.get<PersonalWhatIfResponse>(`/api/users/me/what-if-personal?${q}`, token);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <ScenarioControls date={date} setDate={setDate} time={time} setTime={setTime} eventSize={eventSize} setEventSize={setEventSize}>
        <button type="button" onClick={run} disabled={loading}
          className="rounded-lg bg-unb-red text-white px-6 py-2.5 text-sm font-medium hover:bg-unb-red-dark disabled:opacity-50 transition-colors">
          {loading ? "Calculating…" : "Run my scenario"}
        </button>
      </ScenarioControls>

      {error && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
            <p className="text-xs text-slate-500">
              For your first class on <span className="font-medium text-slate-700">{result.date}</span> near{" "}
              <span className="font-medium text-slate-700">{result.building.name}</span>
              {result.eventSize !== "none" ? ` · ${result.eventSize} event scenario` : ""}
            </p>
          </div>

          {result.lotChanged && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-2">
              <span className="text-red-500 text-lg">⚠</span>
              <p className="text-sm text-red-700 font-medium">
                The event would push you to a different lot. Your recommended parking changes under this scenario.
              </p>
            </div>
          )}

          {result.spotsDroppedBelow10 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-2">
              <span className="text-amber-500 text-lg">⚠</span>
              <p className="text-sm text-amber-700">
                Fewer than 10 spots available in the recommended lot under this scenario — arrive early.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PersonalRecCard label="Without event (baseline)" rec={result.baseline} />
            <PersonalRecCard
              label={result.eventSize !== "none" ? `With ${result.eventSize} event` : "Scenario (same as baseline)"}
              rec={result.scenario}
              highlight={result.lotChanged || result.spotsDroppedBelow10}
            />
          </div>
        </div>
      )}
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
          Compare predicted parking availability under different scenarios.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-xl border-2 border-unb-red overflow-hidden bg-white shadow-sm">
        {(["campus", "personal"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "bg-unb-red text-white"
                : "text-slate-700 hover:bg-unb-red/5"
            } ${tab === "personal" ? "border-l-2 border-unb-red" : ""}`}
          >
            {tab === "campus" ? "Campus view" : "My scenario"}
            {tab === "personal" && !token && (
              <span className="rounded-full bg-slate-200 text-slate-500 text-[10px] px-1.5 py-0.5 font-medium">Login required</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "campus" ? <CampusView token={token} /> : <MyScenario token={token} />}
    </div>
  );
}

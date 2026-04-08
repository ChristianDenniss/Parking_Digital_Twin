import { useEffect, useId, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { ParkingForecastInsights, ParkingForecastResponse } from "../api/types";
import type { ParkingMapDataMode } from "./ParkingMap";

/** Dotted underline + hover/focus tooltip for dense model copy. */
function HoverTerm(props: { children: ReactNode; tip: string; noUnderline?: boolean }) {
  const tipId = useId();
  const line =
    props.noUnderline === true
      ? "border-b-0"
      : "border-b border-dotted border-slate-400 hover:border-slate-600";
  return (
    <span className="relative inline-flex items-center group/hoverterm">
      <span
        tabIndex={0}
        aria-describedby={tipId}
        className={`cursor-help ${line} focus:outline-none focus-visible:ring-2 focus-visible:ring-unb-red focus-visible:ring-offset-1 rounded-sm`}
      >
        {props.children}
      </span>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-[70] mt-1 block w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md bg-slate-900 px-2.5 py-2 text-[11px] font-normal leading-snug text-slate-50 opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-150 delay-75 group-hover/hoverterm:visible group-hover/hoverterm:opacity-100 group-focus-within/hoverterm:visible group-focus-within/hoverterm:opacity-100"
      >
        {props.tip}
      </span>
    </span>
  );
}

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

function normalizeTimeForQuery(timeHHmm: string): string {
  const tm = timeHHmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return timeHHmm.trim();
  const h = parseInt(tm[1]!, 10);
  return `${String(h).padStart(2, "0")}:${tm[2]!}`;
}

function trendBadgeClass(t: ParkingForecastInsights["occupancyTrendNextSlot"]): string {
  if (t === "up") return "bg-orange-50 text-orange-900 border-orange-200";
  if (t === "down") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function ForecastInsightsBlock(props: {
  data: ParkingForecastResponse;
}) {
  const { data } = props;
  const ins = data.insights;
  if (!ins) return null;

  const mapVsCurve =
    data.campusPredictedOccupancyPercent - ins.curveEvenSpreadOccupancyPercent;
  const mapVsCurveNote =
    Math.abs(mapVsCurve) <= 1
      ? "Total occupied stalls match spreading the vehicle curve evenly across all spots; only which stalls fill changes by lot."
      : mapVsCurve > 0
        ? `Map total is ${mapVsCurve} pts higher than an even spread from the curve midpoint - rounding / allocation edge effects.`
        : `Map total is ${Math.abs(mapVsCurve)} pts lower than an even spread from the curve midpoint - rounding / allocation edge effects.`;

  return (
    <div className="space-y-2 overflow-visible">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-slate-100 bg-slate-50/90 p-2.5 text-xs text-slate-700 leading-snug space-y-1.5 overflow-visible">
          <p className="font-semibold text-slate-800">
            <HoverTerm tip="A full-day series of modeled vehicles on campus by time, built from scraped class times, staff assumptions, and commuter vehicle rules (see pplOnCampusByTime.json). The twin uses it to decide how many cars are on campus in each 15-minute slice.">
              Time-of-day curve
            </HoverTerm>
          </p>
          <p>
            <HoverTerm tip="The 15-minute window from the profile that contains your chosen clock time. All numbers in this column refer to that slice, not the whole day.">
              Bucket
            </HoverTerm>{" "}
            <span className="font-medium text-slate-900">
              {ins.profileSlotStart}-{ins.profileSlotEnd}
            </span>{" "}
            (
            <HoverTerm tip="Academic term baked into the profile JSON when it was generated (e.g. Winter 2026).">
              {ins.profileTermLabel}
            </HoverTerm>
            {ins.coursesInProfileFile != null ? (
              <>
                ,{" "}
                <HoverTerm tip="How many course sections were included when the profile file was built. Your live database may differ if you re-scraped or re-seeded.">
                  {ins.coursesInProfileFile} courses in profile file
                </HoverTerm>
              </>
            ) : null}
            ).
          </p>
          {ins.weekendApplied ? (
            <p className="text-amber-900 bg-amber-50/80 rounded px-1.5 py-0.5 border border-amber-100">
              <HoverTerm tip="Saturday and Sunday use a fixed multiplier on the weekday vehicle curve so the model assumes far fewer cars than a Tuesday at the same clock time.">
                Weekend: vehicle curve scaled ×{ins.weekendMultiplier} (sparse campus).
              </HoverTerm>
            </p>
          ) : null}
          <p>
            <HoverTerm tip="Estimated cars on campus for this 15-minute slice: midpoint of the min/max band from the profile (students, instructors, staff vehicles), after any weekend scaling.">
              Modeled vehicles on campus
            </HoverTerm>
            : <strong className="tabular-nums">{ins.modeledCarsOnCampus}</strong>
            {ins.modeledCarsOnCampusMin != null && ins.modeledCarsOnCampusMax != null ? (
              <>
                {" "}
                (
                <HoverTerm tip="Low and high vehicle counts from the profile’s uncertainty ranges (attendance, carpooling, etc.), scaled like the midpoint.">
                  band{" "}
                  <span className="tabular-nums">
                    {ins.modeledCarsOnCampusMin}-{ins.modeledCarsOnCampusMax}
                  </span>
                </HoverTerm>
                )
              </>
            ) : null}
          </p>
          <p>
            This instant is{" "}
            <HoverTerm tip="Compared to every other 15-minute bucket in the same curve (with the same weekend scaling). Higher percent = a busier time-of-day on the model, not ‘busier than last week in real life.’">
              busier than about{" "}
              <strong className="tabular-nums">{ins.profileBusyPercentile}%</strong> of 15-minute buckets on that curve
              {ins.weekendApplied ? " (after weekend scale)" : ""}
            </HoverTerm>
            .
          </p>
          <p className="text-slate-500 text-[11px]">
            <HoverTerm tip="If we took the curve’s vehicle midpoint and filled stalls campus-wide at the same rate (no favoring lots near busy buildings), this is the percent full. The map scenario uses the same total count but shifts which lots fill based on class locations.">
              Even spread from midpoint - ~{ins.curveEvenSpreadOccupancyPercent}% of all stalls.
            </HoverTerm>{" "}
            {mapVsCurveNote}
          </p>
        </div>

        <div className="rounded border border-slate-100 bg-slate-50/90 p-2.5 text-xs text-slate-700 leading-snug space-y-1.5 overflow-visible">
          <p className="font-semibold text-slate-800">
            <HoverTerm tip="Two independent pictures of ‘how much class is happening’ for this 15 minutes: one frozen inside the profile JSON, one computed from courses currently in your database.">
              Class overlap (two sources)
            </HoverTerm>
          </p>
          <p>
            <HoverTerm tip="Values copied from the profile generator’s snapshot of scraped UNB sections. They do not auto-update when you change the DB unless you regenerate the JSON.">
              <span className="text-slate-500">Profile file (frozen scrape):</span>
            </HoverTerm>{" "}
            {ins.profileClassEnrolledProxy != null ? (
              <>
                <HoverTerm tip="Headcount-style total the profile stored for this time slice (enrolled seats overlapping the window, plus baseline campus presence rules in the generator - not the same as unique people).">
                  enrollment proxy{" "}
                  <strong className="tabular-nums">{ins.profileClassEnrolledProxy.toLocaleString()}</strong>
                </HoverTerm>
                {ins.profileSectionsMeeting != null ? (
                  <>
                    ,{" "}
                    <HoverTerm tip="Number of course sections whose meeting times overlap this 15-minute window in the profile data.">
                      <strong className="tabular-nums">{ins.profileSectionsMeeting}</strong> sections in this bucket
                    </HoverTerm>
                  </>
                ) : null}
              </>
            ) : (
              "not available for this bucket"
            )}
            .
          </p>
          <p>
            <HoverTerm tip="What is in your backend right now after seed/scrape - used when assigning extra demand to general lots near buildings with overlapping classes.">
              <span className="text-slate-500">Live course DB (today&apos;s seed):</span>
            </HoverTerm>{" "}
            <HoverTerm tip="For each section that overlaps this window, we add its enrollment (or 1 if missing) and sum across buildings. Double-counts if a student has two overlapping sections.">
              <strong className="tabular-nums">{ins.liveDbClassOverlapEnrollmentSum.toLocaleString()}</strong>{" "}
              enrollment-weighted overlap
            </HoverTerm>
            ,{" "}
            <HoverTerm tip="Distinct buildings that have at least one section meeting during this 15-minute slice, per the live course table.">
              <strong className="tabular-nums">{ins.liveDbBuildingsWithClasses}</strong> buildings with a section
              touching this 15m window
            </HoverTerm>
            .
          </p>
          <p className="text-slate-500 text-[11px]">
            <HoverTerm tip="General parking lots get higher simulated demand when nearby buildings have overlapping classes; resident/staff/PhD lots follow different rules. Mismatch with the profile file usually means courses or seed data changed after the JSON was generated.">
              General lots get extra weight toward buildings with demand; numbers differ if the DB changed after the
              profile JSON was generated.
            </HoverTerm>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 overflow-visible">
        <div className="shrink-0 flex items-center">
          <HoverTerm
            noUnderline
            tip="Direction of the campus vehicle curve from the previous 15-minute bucket - next bucket around your time. It is not a weather forecast; it describes the static profile shape."
          >
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-none ${trendBadgeClass(ins.occupancyTrendNextSlot)}`}
            >
              Trend: {ins.occupancyTrendNextSlot}
            </span>
          </HoverTerm>
        </div>
        <p className="text-xs text-slate-600 flex-1 min-w-[12rem] leading-snug m-0 self-center">
          {ins.occupancyTrendSummary}
        </p>
      </div>

      {ins.classTransitionSummary ? (
        <p className="text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded px-2 py-1.5 leading-snug overflow-visible">
          <HoverTerm tip="The parking simulator randomly flips some stall statuses on a timer. Near typical class-change minutes it speeds up those flips so the fake data feels more volatile - this does not change the deterministic forecast math above.">
            <span className="font-semibold">Simulator:</span> {ins.classTransitionSummary} (×
            {ins.classTransitionMultiplier} churn vs baseline minute.)
          </HoverTerm>
        </p>
      ) : null}
    </div>
  );
}

export function ParkingForecastSection(props: {
  mapDataMode: ParkingMapDataMode;
  mapScenarioDate: string;
  mapScenarioTimeHHmm: string;
}) {
  const { mapDataMode, mapScenarioDate, mapScenarioTimeHHmm } = props;
  const [data, setData] = useState<ParkingForecastResponse | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const usePickTime =
      mapDataMode === "pick-time" &&
      isValidScenarioDateYmd(mapScenarioDate) &&
      isValidScenarioTimeHm(mapScenarioTimeHHmm);

    const q = new URLSearchParams();
    if (usePickTime) {
      q.set("date", mapScenarioDate);
      q.set("time", normalizeTimeForQuery(mapScenarioTimeHHmm));
    }

    setInFlight(true);
    setError(null);

    void (async () => {
      try {
        const path = q.toString()
          ? `/api/parking-lots/forecast?${q.toString()}`
          : "/api/parking-lots/forecast";
        const res = await api.get<ParkingForecastResponse>(path);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Could not load forecast");
        }
      } finally {
        if (!cancelled) setInFlight(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapDataMode, mapScenarioDate, mapScenarioTimeHHmm]);

  const pickTimeOk =
    mapDataMode === "pick-time" &&
    isValidScenarioDateYmd(mapScenarioDate) &&
    isValidScenarioTimeHm(mapScenarioTimeHHmm);

  return (
    <section className="rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm overflow-visible">
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-900">Forecast model</h2>
        {pickTimeOk ? (
          <span className="rounded bg-unb-red/10 text-unb-red text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
            Map pick time
          </span>
        ) : mapDataMode === "pick-time" ? (
          <span className="rounded bg-amber-50 text-amber-900 text-[10px] font-semibold px-2 py-0.5">
            Set map date & time - using Saint John now
          </span>
        ) : (
          <span className="rounded bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5">
            Saint John now
          </span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-red-600 mt-2" role="alert">
          {error}
        </p>
      ) : (
        <details className="mt-2 border-t border-slate-200 pt-2 group overflow-visible">
          <summary className="cursor-pointer list-none text-xs font-medium text-unb-red hover:text-unb-red-dark hover:underline underline-offset-2 flex items-center gap-2 select-none [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-unb-red focus-visible:ring-offset-1 rounded-sm py-0.5 -mx-0.5 px-0.5 w-fit max-w-full">
            <span
              className="inline-block text-[10px] text-slate-500 transition-transform duration-200 group-open:rotate-90"
              aria-hidden
            >
              ▸
            </span>
            Advanced model details
            {inFlight ? (
              <span className="text-[10px] font-normal text-slate-400 normal-case">Updating…</span>
            ) : null}
          </summary>
          <div className="mt-2 pl-4 border-l-2 border-slate-100 overflow-visible">
            {inFlight && !data ? (
              <p className="text-xs text-slate-500" aria-busy="true">
                Loading model details…
              </p>
            ) : null}
            {data ? <ForecastInsightsBlock data={data} /> : null}
          </div>
        </details>
      )}
    </section>
  );
}

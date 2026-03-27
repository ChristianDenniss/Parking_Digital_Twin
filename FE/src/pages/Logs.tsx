import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { ParkingSpotLog } from "../api/types";

const POLL_INTERVAL_MS = 10_000;

export function Logs() {
  const [logs, setLogs] = useState<ParkingSpotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All logs");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = () => {
      if (cancelled || document.hidden || !navigator.onLine) return;
      api
        .get<ParkingSpotLog[]>("/api/parking-spot-logs")
        .then(setLogs)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    };
    const onResume = () => fetchLogs();
    setLoading(true);
    fetchLogs();
    const interval = setInterval(fetchLogs, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
    };
  }, []);

  const statusOptions = useMemo(() => {
    const statuses = [...new Set(logs.map((l) => l.status))].sort();
    return ["All logs", ...statuses];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const from = timeFrom ? new Date(timeFrom).getTime() : null;
    const to = timeTo ? new Date(timeTo).getTime() : null;
    return logs.filter((log) => {
      const matchStatus =
        statusFilter === "All logs" || log.status === statusFilter;
      const matchSearch =
        !search ||
        log.parkingSpot?.label?.toLowerCase().includes(search) ||
        log.parkingSpotId.toLowerCase().includes(search);
      const logTime = new Date(log.recordedAt).getTime();
      const matchTime =
        (from == null || logTime >= from) && (to == null || logTime <= to);
      return matchStatus && matchSearch && matchTime;
    });
  }, [logs, searchText, statusFilter, timeFrom, timeTo]);

  if (loading && logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="skeleton h-8 w-56 mb-4 rounded" aria-hidden />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <div className="skeleton h-4 w-32 mb-1 rounded" />
            <div className="skeleton h-9 w-full rounded" />
          </div>
          <div className="w-40">
            <div className="skeleton h-4 w-24 mb-1 rounded" />
            <div className="skeleton h-9 w-full rounded" />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <div className="skeleton h-4 w-8 mb-1 rounded" />
              <div className="skeleton h-9 w-44 rounded" />
            </div>
            <div>
              <div className="skeleton h-4 w-6 mb-1 rounded" />
              <div className="skeleton h-9 w-44 rounded" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="border-b border-unb-red bg-unb-red">
                  <th className="py-2 px-3 w-1/4"><span className="invisible">Time</span></th>
                  <th className="py-2 px-3 w-1/4"><span className="invisible">Spot</span></th>
                  <th className="py-2 px-3 w-1/4"><span className="invisible">ID</span></th>
                  <th className="py-2 px-3 w-1/4"><span className="invisible">Status</span></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 px-3"><div className="skeleton h-4 w-full max-w-[10rem] rounded" /></td>
                    <td className="py-2 px-3"><div className="skeleton h-4 w-full max-w-[6rem] rounded" /></td>
                    <td className="py-2 px-3"><div className="skeleton h-4 w-14 rounded" /></td>
                    <td className="py-2 px-3"><div className="skeleton h-5 w-16 rounded" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="page-header">Parking Spot Logs</h1>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label className="block text-slate-600 text-sm font-medium mb-1">
            Search by spot ID or label
          </label>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="e.g. GE-A-001"
            className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-slate-800 text-sm"
          />
        </div>
        <div className="w-40">
          <label className="block text-slate-600 text-sm font-medium mb-1">
            Filter by type
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-slate-800 text-sm"
          >
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "All logs" ? opt : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-slate-600 text-sm font-medium mb-1">
              From
            </label>
            <input
              type="datetime-local"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 bg-white text-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-slate-600 text-sm font-medium mb-1">
              To
            </label>
            <input
              type="datetime-local"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 bg-white text-slate-800 text-sm"
            />
          </div>
        </div>
      </div>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="border-b border-unb-red bg-unb-red">
                <th className="text-left py-2 px-3 text-white font-semibold w-1/4">Time</th>
                <th className="text-left py-2 px-3 text-white font-semibold w-1/4">Spot</th>
                <th className="text-left py-2 px-3 text-white font-semibold w-1/4">ID</th>
                <th className="text-left py-2 px-3 text-white font-semibold w-1/4">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {filteredLogs.slice(0, 25).map((log) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="py-2 px-3 text-sm">
                    {new Date(log.recordedAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-sm">
                    {log.parkingSpot?.label ?? `${log.parkingSpotId.slice(0, 8)}…`}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-slate-600" title={log.id}>
                    {log.id.slice(0, 8)}…
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                        log.status === "occupied"
                          ? "bg-red-600 text-white"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLogs.length === 0 && (
          <p className="p-4 text-slate-600 text-sm">
            {logs.length === 0
              ? "No logs yet. Change spot status on a lot to generate logs."
              : "No logs match the search or filter."}
          </p>
        )}
        {filteredLogs.length > 25 && (
          <p className="p-2 text-slate-600 text-sm">Showing latest 25 of {filteredLogs.length}.</p>
        )}
      </div>
    </div>
  );
}

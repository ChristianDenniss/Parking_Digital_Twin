import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ParkingSpotLog, ParkingSpot } from "../api/types";

export function Logs() {
  const [logs, setLogs] = useState<ParkingSpotLog[]>([]);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [spotId, setSpotId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ParkingSpot[]>("/api/parking-spots").then(setSpots).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = spotId
      ? `/api/parking-spot-logs?parkingSpotId=${encodeURIComponent(spotId)}`
      : "/api/parking-spot-logs";
    api
      .get<ParkingSpotLog[]>(url)
      .then(setLogs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [spotId]);

  if (loading && logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="skeleton h-10 w-48 mb-4" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="page-header">Parking spot logs</h1>
      <div className="mb-4 max-w-md">
        <label className="block text-slate-600 text-sm font-medium mb-1">
          Filter by spot (optional)
        </label>
        <select
          value={spotId}
          onChange={(e) => setSpotId(e.target.value)}
          className="w-full px-3 py-2 rounded border border-slate-300 bg-white text-slate-800"
        >
          <option value="">All logs</option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} ({s.currentStatus})
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">Time</th>
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">Spot ID</th>
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {logs.slice(0, 25).map((log) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="py-2 px-3 text-sm">
                    {new Date(log.recordedAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-mono text-sm">
                    {log.parkingSpotId.slice(0, 8)}…
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
        {logs.length === 0 && (
          <p className="p-4 text-slate-600 text-sm">
            No logs yet. Change spot status on a lot to generate logs.
          </p>
        )}
        {logs.length > 25 && (
          <p className="p-2 text-slate-600 text-sm">Showing latest 25.</p>
        )}
      </div>
    </div>
  );
}

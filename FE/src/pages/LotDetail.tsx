import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import type { ParkingLot, ParkingSpot } from "../api/types";
import { LotHeatMap } from "../components/LotHeatMap";
import unbSjSymbolRed from "../images/UNBSymbolRed.png";

/** SVGs in src/images/svgs/*.svg loaded by filename = {lot.name}.svg. After adding new SVG files, restart the dev server (Vite glob is fixed at startup). */
const lotSvgLoaders = import.meta.glob<string>("../images/svgs/*.svg", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export function LotDetail() {
  const { id } = useParams<{ id: string }>();
  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState("");
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);

  // Always fetch all spots for the lot so the heat map can match every SVG shape; filter for list by section below
  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<ParkingLot>(`/api/parking-lots/${id}`),
      api.get<ParkingSpot[]>(`/api/parking-lots/${id}/spots`),
    ])
      .then(([lotData, spotsData]) => {
        setLot(lotData);
        setSpots(spotsData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Keep the heat map live: simulator flips statuses every 5s on the backend.
  // Poll the spot list so the UI updates even if the user never clicks a stall.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const poll = () => {
      api
        .get<ParkingSpot[]>(`/api/parking-lots/${id}/spots`)
        .then((spotsData) => {
          if (!cancelled) setSpots(spotsData);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to refresh spots");
        });
    };

    poll();
    const interval = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id]);

  // Load lot SVG from src/images/svgs/{lot.name}.svg (e.g. TimedParking1.svg)
  useEffect(() => {
    if (!lot?.name) {
      setSvgMarkup(null);
      return;
    }
    const key = `../images/svgs/${lot.name}.svg`;
    const load = lotSvgLoaders[key];
    if (load) {
      load().then(setSvgMarkup).catch(() => setSvgMarkup(null));
    } else {
      setSvgMarkup(null);
    }
  }, [lot?.name]);

  const refreshSpots = () => {
    if (!id) return;
    api.get<ParkingSpot[]>(`/api/parking-lots/${id}/spots`).then(setSpots).catch((e) => setError(e.message));
  };

  const toggleStatus = async (spot: ParkingSpot) => {
    const next = spot.currentStatus === "occupied" ? "empty" : "occupied";
    try {
      await api.patch<ParkingSpot>(`/api/parking-spots/${spot.id}/status`, { status: next });
      refreshSpots();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 text-red-600">
        Error: {error}
      </div>
    );
  }
  if (!lot) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        Lot not found.
      </div>
    );
  }

  const sections = [...new Set(spots.map((s) => s.section).filter(Boolean))];
  const spotsForList = section ? spots.filter((s) => s.section === section) : spots;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <p className="mb-4">
        <Link to="/" className="text-unb-red">
          ← Back to campus map
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{lot.name}</h1>
      <div className="flex flex-wrap justify-start gap-4 my-2">
        <span className="rounded border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">Location: {lot.campus}</span>
        <span className="rounded border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">Parking Lot Capacity: {lot.capacity}</span>
      </div>

      <section className="mb-4">
        <LotHeatMap
          spots={spots}
          svgMarkup={svgMarkup}
          onSpotClick={toggleStatus}
          showLegend
          className="min-h-[200px]"
        />
      </section>

      {sections.length > 0 && (
        <div className="mb-3">
          <label className="block text-unb-red text-xs font-semibold mb-0.5 tracking-wide uppercase">Row</label>
          <div className="flex items-center gap-2">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full max-w-[180px] px-2 py-1 rounded border border-unb-red/40 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-unb-red/30 focus:border-unb-red"
            >
              <option value="">All</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <img src={unbSjSymbolRed} alt="" aria-hidden className="h-5 w-5 opacity-80" />
          </div>
        </div>
      )}

      <p className="text-slate-500 text-sm mb-4">Live data updates every 5 seconds.</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
        {spotsForList.map((spot) => (
          <button
            key={spot.id}
            type="button"
            className={`rounded border px-2 py-1.5 text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${
              spot.currentStatus === "occupied"
                ? "border-red-200 bg-red-50 text-red-700 hover:border-unb-red/60"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-unb-red/60"
            }`}
            onClick={() => toggleStatus(spot)}
            title={`${spot.label} — ${spot.currentStatus}`}
          >
            {spot.label}
          </button>
        ))}
      </div>
      {spotsForList.length === 0 && (
        <p className="text-slate-500 mt-4">No spots in this lot.</p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ParkingLot, ParkingSpot } from "../api/types";
import { ParkingMap } from "../components/ParkingMap";
import unbLogoAlternate from "../images/UNBlogoAlternate.png";

/** Sections GeoJSON from /api/earth-engine/sections */
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

type LotSortOption = "most-free" | "highest-free-pct" | "biggest" | "smallest";

/** Tailwind text color class for % full (occupancy) on lot cards. */
function getOccupancyColorClass(pct: number): string {
  if (pct >= 95) return "text-red-900 font-semibold";   // Essentially full
  if (pct >= 85) return "text-red-600 font-medium";     // Very high congestion
  if (pct >= 75) return "text-orange-600 font-medium";  // Filling fast
  if (pct >= 60) return "text-yellow-600 font-medium";  // Moderate
  if (pct >= 40) return "text-green-400 font-medium";   // Plenty available
  return "text-green-800 font-medium";                  // Very open (< 40%)
}

export function Home() {
  const navigate = useNavigate();
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [tileUrlError, setTileUrlError] = useState<string | null>(null);
  const [sectionsGeoJSON, setSectionsGeoJSON] = useState<SectionsGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lotSort, setLotSort] = useState<LotSortOption>("biggest");

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
      .catch(() => setSectionsGeoJSON(null)); // optional: map works without sections layer
  }, []);

  const sectionsWithLotNames = useMemo(() => {
    if (!sectionsGeoJSON || !Array.isArray(sectionsGeoJSON.features) || sectionsGeoJSON.features.length === 0) {
      return sectionsGeoJSON;
    }
    // Prefer backend / GEE-provided name; only fall back to lot ordering if name is missing.
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

  if (loading) {
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

  if (error) {
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
    // Campus-wide %: based on current total spots in DB.
    occupancyPercent: totalSpots ? Math.round((occupiedCount / totalSpots) * 100) : 0,
  };

  const statsOverlay = (
    <div className="rounded-lg border-2 border-unb-red bg-white/95 backdrop-blur p-4 shadow-lg">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Live occupancy
      </p>
      <div className="grid grid-cols-4 gap-3 text-center">
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

  const half = Math.ceil(sortedByLot.length / 2);
  const leftColumn = sortedByLot.slice(0, half);
  const rightColumn = sortedByLot.slice(half);
  const lotCardClass =
    "w-full text-left rounded border border-slate-200 bg-white py-2 px-3 flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-0.5 transition-all duration-200 hover:scale-[1.02] hover:bg-unb-red/5 hover:border-unb-red/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-unb-red focus-visible:ring-offset-1 cursor-pointer";

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
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

      <section>
        <h2 className="text-lg font-semibold mb-3">Campus map (Google Earth Engine API)</h2>
        <ParkingMap
          earthEngineTileUrl={tileUrl}
          sectionsGeoJSON={sectionsWithLotNames}
          lots={lots}
          onSectionClick={(lotId) => navigate(`/lot/${lotId}`)}
          className="h-[480px]"
        >
          {statsOverlay}
        </ParkingMap>
      </section>

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
        {byLot.length === 0 ? (
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
                  className={lotCardClass}
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
                  className={lotCardClass}
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
    </div>
  );
}


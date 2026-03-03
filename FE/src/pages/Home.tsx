import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ParkingLot, ParkingSpot } from "../api/types";
import { ParkingMap } from "../components/ParkingMap";

/** Sections GeoJSON from /api/earth-engine/sections */
interface SectionsGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown> & { name: string };
  }>;
}

/** Known total parking spaces on campus (UNB Saint John). */
const CAMPUS_TOTAL_SPACES = 1_170;

interface Stats {
  totalSpots: number;
  occupied: number;
  empty: number;
  occupancyPercent: number;
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
    const lotOrder = [
      "GeneralParking1", "GeneralParking2", "GeneralParking3", "GeneralParking4",
      "StaffParking1", "StaffParking2", "StaffParking3",
      "TBD", "TBD2", "TBD3",
      "ResidentParking1", "ResidentParking2",
      "TimedParking1", "TimedParking2",
    ];
    const sortedLots = [...lots].sort(
      (a, b) => lotOrder.indexOf(a.name) - lotOrder.indexOf(b.name)
    );
    return {
      ...sectionsGeoJSON,
      features: sectionsGeoJSON.features.map((f, i) => ({
        ...f,
        properties: {
          ...f.properties,
          name: sortedLots[i]?.name ?? f.properties?.name ?? `Section ${i + 1}`,
        },
      })),
    };
  }, [sectionsGeoJSON, lots]);

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
    // Campus-wide %: use 1,170 as denominator so "whole campus" view is correct
    occupancyPercent: Math.round((occupiedCount / CAMPUS_TOTAL_SPACES) * 100),
  };

  const byLot = lots.map((lot) => {
    const lotSpots = spots.filter((s) => s.parkingLotId === lot.id);
    const occupied = lotSpots.filter((s) => s.currentStatus === "occupied").length;
    const total = lotSpots.length;
    const empty = total - occupied;
    const occupancyPercent = total ? Math.round((occupied / total) * 100) : 0;
    return {
      lot,
      total,
      occupied,
      empty,
      occupancyPercent,
    };
  });

  const statsOverlay = (
    <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur p-4 shadow-lg">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Live occupancy
      </p>
      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <p className="text-lg font-bold">{CAMPUS_TOTAL_SPACES.toLocaleString()}</p>
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
          <p className="text-lg font-bold text-sky-600">{stats.occupancyPercent}%</p>
          <p className="text-xs text-slate-500">Occupancy</p>
        </div>
      </div>
      {tileUrlError && (
        <p className="text-xs text-amber-600 mt-2">Map layer: {tileUrlError}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">UNB Parking Digital Twin</h1>
        <p className="text-slate-600">
          Live view of parking occupancy on campus (simulated sensors). Campus total:{" "}
          <strong>{CAMPUS_TOTAL_SPACES.toLocaleString()} parking spaces</strong>.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">Campus map (Earth Engine)</h2>
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
        <h2 className="text-lg font-semibold mb-3">By lot</h2>
        <p className="text-sm text-slate-500 mb-3">
          Total and occupancy % per lot (subsection of campus).
        </p>
        {byLot.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No lots found. Did you run <code>npm run seed</code> in the backend?
          </p>
        ) : (
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
            {byLot.map(({ lot, total, occupied, empty, occupancyPercent }) => (
              <button
                type="button"
                key={lot.id}
                onClick={() => navigate(`/lot/${lot.id}`)}
                className="w-full text-left rounded border border-slate-200 bg-white py-2 px-3 flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-0.5 transition-all duration-200 hover:scale-[1.02] hover:bg-slate-50 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-semibold text-sm truncate">{lot.name}</p>
                  <span className="text-xs text-slate-500 shrink-0">{lot.campus}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs">
                  <span className="text-slate-600">Total: {total}</span>
                  <span className="text-emerald-600">Free: {empty}</span>
                  <span className="text-red-600">Taken: {occupied}</span>
                  <span className="font-medium text-sky-600">{occupancyPercent}%</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ParkingLot } from "../api/types";

export function Lots() {
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ParkingLot[]>("/api/parking-lots")
      .then(setLots)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="skeleton h-10 w-64 mb-4" />
        <div className="skeleton h-20 w-full mb-2" />
        <div className="skeleton h-20 w-full mb-2" />
        <div className="skeleton h-20 w-full" />
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="page-header">Parking lots</h1>
      <div className="flex flex-col gap-2">
        {lots.map((lot) => (
          <Link
            key={lot.id}
            to={`/lot/${lot.id}`}
            className="block p-4 rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:shadow transition-colors"
          >
            <span className="font-bold">{lot.name}</span>
            <span className="text-slate-600"> — {lot.campus} · capacity {lot.capacity}</span>
          </Link>
        ))}
      </div>
      {lots.length === 0 && (
        <p className="text-slate-600 mt-4">
          No lots. Run <code className="bg-slate-200 px-1 rounded text-slate-800">npm run seed</code> in BE.
        </p>
      )}
    </div>
  );
}

import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ParkingLot } from "../api/types";
import noImageUrl from "../images/NoImage.jpg";

const lotImages: Record<string, string> = (() => {
  const modules = import.meta.glob("../images/*.{png,jpg,jpeg,webp}", {
    eager: true,
    as: "url",
  }) as Record<string, string>;
  const map: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const parts = path.split("/");
    const filename = parts[parts.length - 1] ?? "";
    const baseName = filename.replace(/\.[^.]+$/, "");
    if (baseName) {
      map[baseName] = url;
    }
  }
  return map;
})();

const PAGE_SIZE = 12;
type SortOption = "name-asc" | "name-desc" | "capacity-desc" | "capacity-asc";

export function Lots() {
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get<ParkingLot[]>("/api/parking-lots")
      .then(setLots)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const sortedLots = useMemo(() => {
    const list = [...lots];
    switch (sort) {
      case "name-asc":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case "capacity-desc":
        return list.sort((a, b) => b.capacity - a.capacity);
      case "capacity-asc":
        return list.sort((a, b) => a.capacity - b.capacity);
      default:
        return list;
    }
  }, [lots, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedLots.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedLots = useMemo(
    () => sortedLots.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedLots, currentPage]
  );

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="skeleton h-10 w-64 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 text-red-600">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Parking lots</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 font-medium">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-slate-800 text-sm"
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="capacity-desc">Capacity (high first)</option>
            <option value="capacity-asc">Capacity (low first)</option>
          </select>
        </div>
      </div>

      {lots.length === 0 ? (
        <p className="text-slate-600">
          No lots. Run <code className="bg-slate-200 px-1 rounded text-slate-800">npm run seed</code> in BE.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {paginatedLots.map((lot) => {
              const mappedImage = lotImages[lot.name];
              const imageSrc = mappedImage || lot.imageUrl?.trim() || noImageUrl;
              return (
                <Link
                  key={lot.id}
                  to={`/lot/${lot.id}`}
                  className="group relative block rounded-xl border border-slate-200 bg-slate-100 shadow-sm overflow-hidden hover:border-slate-300 hover:shadow-md transition-all duration-200 aspect-square min-h-[140px]"
                >
                  <img
                    src={imageSrc}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = noImageUrl;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    <p className="font-bold truncate group-hover:text-unb-red transition-colors drop-shadow-sm" title={lot.name}>
                      {lot.name}
                    </p>
                    <p className="text-xs text-white/90 mt-0.5 truncate" title={lot.campus}>
                      {lot.campus}
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-semibold text-unb-red">{lot.capacity}</span> spaces
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded border-2 border-unb-red bg-white text-unb-red text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-unb-red hover:text-white transition-colors disabled:hover:bg-white disabled:hover:text-unb-red"
              >
                Previous
              </button>
              <span className="text-sm text-slate-700 px-3 py-2 font-medium">
                Page <span className="text-unb-red font-semibold">{currentPage}</span> of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded border-2 border-unb-red bg-white text-unb-red text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-unb-red hover:text-white transition-colors disabled:hover:bg-white disabled:hover:text-unb-red"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

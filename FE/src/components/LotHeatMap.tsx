import { useCallback, useEffect, useRef } from "react";
import type { ParkingSpot } from "../api/types";

export interface LotHeatMapProps {
  spots: ParkingSpot[];
  svgMarkup: string | null;
  onSpotClick?: (spot: ParkingSpot) => void;
  showLegend?: boolean;
  className?: string;
}

const EMPTY_COLOR = "#10b981";
const OCCUPIED_COLOR = "#ef4444";

/**
 * SVG is source of truth: each spot layer (data-spot-label, not BG) = one spot, in order.
 * We match spots to layers 1:1 by position (spots ordered by slotIndex, layers in document order).
 * Each layer gets data-spot-id so click uses entity id.
 */
export function LotHeatMap({
  spots,
  svgMarkup,
  onSpotClick,
  showLegend = true,
  className = "",
}: LotHeatMapProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const spotsById = useRef(new Map<string, ParkingSpot>());
  spotsById.current = new Map(spots.map((s) => [s.id, s]));

  // Spots are already ordered by slotIndex from API (1, 2, 3, ...). Get spot layers from SVG in document order (skip BG).
  useEffect(() => {
    if (!svgMarkup || !svgContainerRef.current) return;
    const root = svgContainerRef.current.querySelector("svg");
    if (!root) return;
    const allWithLabel = Array.from(root.querySelectorAll("[data-spot-label]"));
    const spotLayers = allWithLabel.filter((el) => {
      const label = (el as SVGElement).getAttribute("data-spot-label") ?? "";
      const id = (el as SVGElement).getAttribute("id") ?? "";
      return !/BG/i.test(label) && !/BG/i.test(id);
    });
    // 1:1 by position: spots[i] ↔ spotLayers[i]
    spotLayers.forEach((el, i) => {
      const spot = spots[i];
      const elHtml = el as SVGElement;
      if (spot) {
        elHtml.style.fill = spot.currentStatus === "occupied" ? OCCUPIED_COLOR : EMPTY_COLOR;
        elHtml.style.cursor = onSpotClick ? "pointer" : "default";
        elHtml.setAttribute("data-spot-id", spot.id);
        elHtml.setAttribute("aria-label", `${spot.label}: ${spot.currentStatus}`);
      }
    });
  }, [svgMarkup, spots, onSpotClick]);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSpotClick) return;
      const target = (e.target as Element).closest("[data-spot-id]");
      if (!target) return;
      const id = target.getAttribute("data-spot-id");
      if (!id) return;
      const spot = spotsById.current.get(id);
      if (spot) onSpotClick(spot);
    },
    [onSpotClick]
  );

  if (!svgMarkup || svgMarkup.trim() === "") {
    return (
      <div
        className={`rounded-lg border border-slate-200 border-dashed bg-slate-50 min-h-[240px] flex items-center justify-center text-slate-500 text-sm px-4 ${className}`}
      >
        <p className="text-center max-w-sm">
          No lot map. Add an SVG with <code className="bg-slate-200 px-1 rounded text-xs">data-spot-label</code> on each spot layer (layers with BG in the name are ignored).
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={svgContainerRef}
        className="rounded-lg border border-slate-200 bg-white overflow-hidden [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
        onClick={handleSvgClick}
        role="img"
        aria-label="Lot heat map"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {showLegend && (
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500" aria-hidden /> Free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500" aria-hidden /> Taken
          </span>
        </div>
      )}
    </div>
  );
}

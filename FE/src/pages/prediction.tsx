import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type {
  Building,
  PredictionMode,
  ParkingLotPrediction,
} from "../api/types";

function todayLocalYmd() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function timeNowHHmm() {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

function percent(value?: number) {
  if (!value) return "—";
  return `${Math.round(value)}%`;
}

export function Predictions() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState("");

  const [predictionMode, setPredictionMode] =
    useState<PredictionMode>("weekday");

  const [date, setDate] = useState(todayLocalYmd());
  const [time, setTime] = useState(timeNowHHmm());

  const [predictions, setPredictions] =
    useState<ParkingLotPrediction[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBuildings() {
      const data = await api.getBuildings();
      setBuildings(data);
      if (data.length > 0) {
        setBuildingId(data[0].id);
      }
    }

    loadBuildings();
  }, []);

  async function runPrediction() {
    try {
      setLoading(true);
      setError("");

      const result = await api.getPredictedLotOccupancy({
        arrivalTime: `${date}T${time}`,
        buildingId,
        predictionMode,
      });

      setPredictions(result);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof ApiError
          ? err.message
          : "Prediction failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="px-[clamp(1.5rem,6vw,5rem)] py-8 space-y-6">
      
      {/* HEADER */}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">
          Parking Predictions
        </h1>

        <p className="mt-2 text-slate-600">
          Forecast parking availability across campus based on
          time, building destination, and activity scenario.
        </p>
      </section>

      {/* INPUTS */}

      <section className="rounded-2xl border bg-white p-6 shadow-sm grid gap-4 md:grid-cols-3">

        <label>
          <span className="text-sm font-medium">
            Destination Building
          </span>

          <select
            value={buildingId}
            onChange={(e) =>
              setBuildingId(e.target.value)
            }
            className="w-full border rounded-xl p-2 mt-1"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-sm font-medium">
            Prediction Mode
          </span>

          <select
            value={predictionMode}
            onChange={(e) =>
              setPredictionMode(
                e.target.value as PredictionMode
              )
            }
            className="w-full border rounded-xl p-2 mt-1"
          >
            <option value="weekday">Weekday</option>
            <option value="weekend">Weekend</option>
            <option value="small_event">Small Event</option>
            <option value="medium_event">Medium Event</option>
            <option value="large_event">Large Event</option>
          </select>
        </label>

        <label>
          <span className="text-sm font-medium">
            Arrival Time
          </span>

          <input
            type="time"
            value={time}
            onChange={(e) =>
              setTime(e.target.value)
            }
            className="w-full border rounded-xl p-2 mt-1"
          />
        </label>

      </section>

      {/* RUN BUTTON */}

      <button
        onClick={runPrediction}
        className="rounded-full bg-unb-red px-5 py-2 text-white"
      >
        Run Prediction
      </button>

      {/* ERROR */}

      {error && (
        <div className="bg-red-50 border p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* RESULTS */}

      {predictions.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

          {predictions.map((lot) => (
            <div
              key={lot.lotId}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-bold">
                {lot.lotName}
              </h3>

              <p className="text-sm text-slate-600 mt-1">
                Occupancy:
                {" "}
                <strong>
                  {percent(lot.predictedOccupancyPercent)}
                </strong>
              </p>

              <p className="text-sm text-slate-600">
                Free Spots:
                {" "}
                <strong>
                  {lot.predictedFreeSpots}
                </strong>
              </p>

              <p className="text-sm text-slate-600">
                Walk Distance:
                {" "}
                <strong>
                  {lot.distanceMeters} m
                </strong>
              </p>
            </div>
          ))}

        </section>
      )}

    </main>
  );
}

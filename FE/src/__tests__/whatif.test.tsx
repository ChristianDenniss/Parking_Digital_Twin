/**
 * Smoke tests for the What-If Explorer page.
 * Mocks the api module so no real network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { WhatIf } from "../pages/WhatIf";

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) { super(msg); this.status = status; }
  },
  api: {
    get: vi.fn(),
  },
}));

import { api } from "../api/client";

const mockGet = api.get as ReturnType<typeof vi.fn>;

const sampleResponse = {
  date: "2026-03-24",
  time: "10:00",
  dayOfWeek: "Tuesday",
  eventSize: "none",
  useEnrollment: true,
  targetAt: "2026-03-24T14:00:00.000Z",
  lots: [
    {
      lotId: "lot-1",
      lotName: "GeneralParking1",
      lotType: "general",
      baseline: { occupancyPct: 70, freeSpots: 35, confidence: "data" },
      scenario: { occupancyPct: 70, freeSpots: 35, confidence: "data" },
      delta: { occupancyPct: 0, freeSpots: 0 },
    },
    {
      lotId: "lot-2",
      lotName: "StaffParking1",
      lotType: "staff",
      baseline: { occupancyPct: 55, freeSpots: 76, confidence: "curve" },
      scenario: { occupancyPct: 76, freeSpots: 40, confidence: "curve" },
      delta: { occupancyPct: 21, freeSpots: -36 },
    },
  ],
  summary: {
    totalBaselineFreeSpots: 111,
    totalScenarioFreeSpots: 75,
    totalCapacity: 288,
    baselineOccupancyPct: 61,
    scenarioOccupancyPct: 74,
  },
};

function renderWhatIf() {
  return render(
    <BrowserRouter>
      <WhatIf />
    </BrowserRouter>
  );
}

beforeEach(() => {
  mockGet.mockReset();
});

describe("WhatIf page", () => {
  it("renders the page heading and controls", () => {
    renderWhatIf();
    expect(screen.getByText("What-If Explorer")).toBeInTheDocument();
    expect(screen.getByText("Run scenario")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Arrival time")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/no event/i)).toBeInTheDocument();
  });

  it("shows results table after a successful API call", async () => {
    mockGet.mockResolvedValueOnce(sampleResponse);
    renderWhatIf();

    fireEvent.click(screen.getByText("Run scenario"));

    await waitFor(() => {
      expect(screen.getByText("GeneralParking1")).toBeInTheDocument();
      expect(screen.getByText("StaffParking1")).toBeInTheDocument();
    });
  });

  it("shows a summary occupancy figure", async () => {
    mockGet.mockResolvedValueOnce(sampleResponse);
    renderWhatIf();

    fireEvent.click(screen.getByText("Run scenario"));

    await waitFor(() => {
      expect(screen.getByText("61%")).toBeInTheDocument(); // baseline
      expect(screen.getByText("74%")).toBeInTheDocument(); // scenario
    });
  });

  it("shows an error message on API failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("Internal server error"));
    renderWhatIf();

    fireEvent.click(screen.getByText("Run scenario"));

    await waitFor(() => {
      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });
  });

  it("shows a positive delta badge when scenario occupancy is higher", async () => {
    mockGet.mockResolvedValueOnce(sampleResponse);
    renderWhatIf();

    fireEvent.click(screen.getByText("Run scenario"));

    await waitFor(() => {
      // StaffParking1 has delta +21%
      expect(screen.getByText(/▲.*21/)).toBeInTheDocument();
    });
  });
});

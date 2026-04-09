/**
 * Regression test:
 * day-plan "current" mode still provides scenario snapshot statuses/free counts.
 * Recommendation must honor those snapshot inputs instead of live DB status.
 */
const mockedFindAllDistances = jest.fn();
const mockedSpotFind = jest.fn();

jest.mock("../modules/buildings/lotBuildingDistance.service", () => ({
  findAll: (...args: unknown[]) => mockedFindAllDistances(...args),
}));

jest.mock("../db/data-source", () => ({
  AppDataSource: {
    getRepository: (entity: { name?: string }) => {
      if (entity?.name === "ParkingSpot") {
        return { find: (...args: unknown[]) => mockedSpotFind(...args) };
      }
      return {
        find: jest.fn(),
        findOne: jest.fn(),
      };
    },
  },
}));

import { recommendBestParking } from "../modules/parkingLots/parkingLot.service";

describe("recommendBestParking with scenario snapshot inputs", () => {
  it("skips full snapshot lots and picks an empty snapshot stall in current mode", async () => {
    mockedFindAllDistances.mockResolvedValue([
      {
        parkingLotId: "lot-a",
        distanceMeters: 100,
        parkingLot: { id: "lot-a", name: "GeneralParkingA", capacity: 2 },
      },
      {
        parkingLotId: "lot-b",
        distanceMeters: 110,
        parkingLot: { id: "lot-b", name: "GeneralParkingB", capacity: 2 },
      },
    ]);

    mockedSpotFind.mockImplementation(async ({ where }: { where: { parkingLotId: string } }) => {
      if (where.parkingLotId === "lot-a") {
        return [
          {
            id: "a-1",
            parkingLotId: "lot-a",
            currentStatus: "empty",
            isAccessible: false,
            distanceFromExit: 1,
          },
          {
            id: "a-2",
            parkingLotId: "lot-a",
            currentStatus: "empty",
            isAccessible: false,
            distanceFromExit: 2,
          },
        ];
      }
      return [
        {
          id: "b-1",
          parkingLotId: "lot-b",
          currentStatus: "occupied",
          isAccessible: false,
          distanceFromExit: 1,
        },
        {
          id: "b-2",
          parkingLotId: "lot-b",
          currentStatus: "occupied",
          isAccessible: false,
          distanceFromExit: 2,
        },
      ];
    });

    const rec = await recommendBestParking({
      buildingId: "building-1",
      stateMode: "current",
      predictedFreeSpotsByLotId: {
        "lot-a": 0,
        "lot-b": 1,
      },
      predictedSpotStatusByLotId: {
        "lot-a": {
          "a-1": "occupied",
          "a-2": "occupied",
        },
        "lot-b": {
          "b-1": "empty",
          "b-2": "occupied",
        },
      },
    });

    expect(rec).not.toBeNull();
    expect(rec!.lot.id).toBe("lot-b");
    expect(rec!.spot.id).toBe("b-1");
    expect(rec!.freeSpotsInSelectedLot).toBe(1);
  });
});

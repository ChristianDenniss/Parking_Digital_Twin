import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import path from "path";
import { isLocalAppMode } from "../config/appMode";
import { ParkingLot } from "../modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../modules/parkingSpots/parkingSpot.entity";
import { ParkingSpotLog } from "../modules/parkingSpotLogs/parkingSpotLog.entity";
import { HistoricalProxyData } from "../modules/historical/historical.entity";
import { Student } from "../modules/students/student.entity";
import { Course } from "../modules/classes/course.entity";
import { ClassSchedule } from "../modules/classSchedule/classSchedule.entity";
import { User } from "../modules/users/user.entity";
import { Building } from "../modules/buildings/building.entity";
import { LotBuildingDistance } from "../modules/buildings/lotBuildingDistance.entity";
import { CampusParameter } from "../modules/campusParameters/campusParameter.entity";
import { LotOccupancyCorrection } from "../modules/prediction/lotOccupancyCorrection.entity";

const ENTITIES = [
  ParkingLot,
  ParkingSpot,
  ParkingSpotLog,
  HistoricalProxyData,
  User,
  Student,
  Course,
  ClassSchedule,
  Building,
  LotBuildingDistance,
  CampusParameter,
  LotOccupancyCorrection,
];

function createDataSource(): DataSource {
  if (isLocalAppMode()) {
    const dbPath = path.join(__dirname, "..", "..", "data", "database.sqlite");
    return new DataSource({
      type: "better-sqlite3",
      database: dbPath,
      synchronize: true,
      logging: false,
      entities: ENTITIES,
      migrations: [],
      subscribers: [],
    });
  }

  // Production: Postgres (Supabase or any Postgres host)
  const connectionString =
    process.env.DATABASE_CONNECTION_STRING ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_CONNECTION_STRING (or DATABASE_URL) must be set in production mode."
    );
  }
  return new DataSource({
    type: "postgres",
    url: connectionString,
    synchronize: true,
    logging: false,
    ssl: { rejectUnauthorized: false },
    entities: ENTITIES,
    migrations: [],
    subscribers: [],
  });
}

export const AppDataSource = createDataSource();

export const DB_CONNECTION_SUMMARY = isLocalAppMode()
  ? "SQLite (local)"
  : `Postgres (${(process.env.DATABASE_CONNECTION_STRING ?? process.env.DATABASE_URL ?? "").replace(/:[^:@]*@/, ":***@")})`;

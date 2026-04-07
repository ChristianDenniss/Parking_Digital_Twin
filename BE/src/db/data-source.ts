import "dotenv/config";
import "reflect-metadata";
import { DataSource, type DataSourceOptions } from "typeorm";
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

const dbPath = path.join(__dirname, "..", "..", "data", "database.sqlite");
const databaseUrlRaw =
  process.env.DATABASE_CONNECTION_STRING?.trim() || process.env.DATABASE_URL?.trim();
/** Local mode always uses SQLite so .env can keep prod DB strings without affecting dev. */
const databaseUrl = isLocalAppMode() ? undefined : databaseUrlRaw;
const usePostgres = Boolean(databaseUrl);
const postgresHost = (() => {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).host;
  } catch {
    return null;
  }
})();

const baseOptions = {
  synchronize: true,
  logging: false,
  entities: [
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
  ],
  migrations: [],
  subscribers: [],
};

const dataSourceOptions: DataSourceOptions = usePostgres
  ? {
      ...baseOptions,
      type: "postgres",
      url: databaseUrl,
      ssl: { rejectUnauthorized: false },
    }
  : {
      ...baseOptions,
      type: "better-sqlite3",
      database: dbPath,
    };

export const AppDataSource = new DataSource(dataSourceOptions);

export const DB_CONNECTION_SUMMARY = usePostgres
  ? `Supabase/Postgres (${postgresHost ?? "host unavailable"})`
  : `local SQLite (${dbPath})`;

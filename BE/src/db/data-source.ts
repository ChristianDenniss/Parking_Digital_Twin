import "reflect-metadata";
import { DataSource } from "typeorm";
import path from "path";
import { ParkingLot } from "../modules/parkingLots/parkingLot.entity";
import { ParkingSpot } from "../modules/parkingSpots/parkingSpot.entity";
import { ParkingSpotLog } from "../modules/parkingSpotLogs/parkingSpotLog.entity";
import { HistoricalProxyData } from "../modules/historical/historical.entity";
import { Student } from "../modules/students/student.entity";
import { Course } from "../modules/classes/course.entity";
import { ClassSchedule } from "../modules/classSchedule/classSchedule.entity";
import { User } from "../modules/users/user.entity";

const dbPath = path.join(__dirname, "..", "..", "data", "database.sqlite");

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: dbPath,
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
  ],
  migrations: [],
  subscribers: [],
});

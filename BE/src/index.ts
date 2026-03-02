import "reflect-metadata";
import express from "express";
import { AppDataSource } from "./db/data-source";
import { notFound, errorHandler } from "./middleware";
import { startSimulator } from "./modules/simulator";
import parkingLotRoute from "./modules/parkingLots/parkingLot.route";
import parkingSpotRoute from "./modules/parkingSpots/parkingSpot.route";
import parkingSpotLogRoute from "./modules/parkingSpotLogs/parkingSpotLog.route";
import historicalRoute from "./modules/historical/historical.route";
import studentRoute from "./modules/students/student.route";
import courseRoute from "./modules/classes/course.route";
import classScheduleRoute from "./modules/classSchedule/classSchedule.route";
import authRoute from "./modules/users/auth.route";
import userRoute from "./modules/users/user.route";

const PORT = process.env.PORT || 3000;

async function main() {
  await AppDataSource.initialize();
  const app = express();
  app.use(express.json());

  app.use("/api/parking-lots", parkingLotRoute);
  app.use("/api/parking-spots", parkingSpotRoute);
  app.use("/api/parking-spot-logs", parkingSpotLogRoute);
  app.use("/api/historical", historicalRoute);
  app.use("/api/students", studentRoute);
  app.use("/api/classes", courseRoute);
  app.use("/api/class-schedule", classScheduleRoute);
  app.use("/api/auth", authRoute);
  app.use("/api/users", userRoute);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "unb-parking-twin-be" });
  });

  app.use(notFound);
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`BE running at http://localhost:${PORT}`);
    startSimulator();
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});

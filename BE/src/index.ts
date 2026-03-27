import "reflect-metadata";
import path from "path";
import express from "express";
import cors from "cors";
import { AppDataSource, DB_CONNECTION_SUMMARY } from "./db/data-source";
import { initializeEarthEngine } from "./config/earthEngine";
import { notFound, errorHandler, requestLogger, loggingMiddleware } from "./middleware";
import { cacheHealthCheck } from "./middleware/cache";
import { startSimulator } from "./modules/simulator";
import simulatorRoute from "./modules/simulator.route";
import parkingLotRoute from "./modules/parkingLots/parkingLot.route";
import parkingSpotRoute from "./modules/parkingSpots/parkingSpot.route";
import parkingSpotLogRoute from "./modules/parkingSpotLogs/parkingSpotLog.route";
import historicalRoute from "./modules/historical/historical.route";
import studentRoute from "./modules/students/student.route";
import courseRoute from "./modules/classes/course.route";
import classScheduleRoute from "./modules/classSchedule/classSchedule.route";
import buildingRoute from "./modules/buildings/building.route";
import authRoute from "./modules/users/auth.route";
import userRoute from "./modules/users/user.route";
import earthEngineRoute from "./modules/earthEngine/earthEngine.route";

const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  await AppDataSource.initialize();
  console.log(`[db] Connected: ${DB_CONNECTION_SUMMARY}`);
  await initializeEarthEngine();

  const app = express();
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(requestLogger);
  app.use(loggingMiddleware);

  app.use("/api/parking-lots", parkingLotRoute);
  app.use("/api/parking-spots", parkingSpotRoute);
  app.use("/api/simulator", simulatorRoute);
  app.use("/api/parking-spot-logs", parkingSpotLogRoute);
  app.use("/api/historical", historicalRoute);
  app.use("/api/students", studentRoute);
  app.use("/api/classes", courseRoute);
  app.use("/api/class-schedule", classScheduleRoute);
  app.use("/api/buildings", buildingRoute);
  app.use("/api/auth", authRoute);
  app.use("/api/users", userRoute);
  app.use("/api/earth-engine", earthEngineRoute);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "unb-parking-twin-be" });
  });
  app.get("/api/cache/health", cacheHealthCheck);

  app.get("/api/openapi.yaml", (_req, res) => {
    res.type("application/x-yaml");
    res.sendFile(path.join(process.cwd(), "openapi.yaml"));
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

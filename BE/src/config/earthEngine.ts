import { ensureInitialized } from "../modules/earthEngine/earthEngine.service";

/**
 * Initializes Earth Engine using service account credentials.
 * Call once on server start so Earth Engine is ready for tiles and GeoJSON without per-request init.
 */
export async function initializeEarthEngine(): Promise<void> {
  await ensureInitialized();
  console.log("Earth Engine initialized");
}

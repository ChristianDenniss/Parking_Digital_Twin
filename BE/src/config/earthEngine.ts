import { ensureInitialized } from "../modules/earthEngine/earthEngine.service";

/**
 * Initializes Earth Engine using service account credentials.
 * Call once on server start so Earth Engine is ready for tiles and GeoJSON without per-request init.
 */
export async function initializeEarthEngine(): Promise<void> {
  try {
    await ensureInitialized();
    console.log("Earth Engine initialized");
  } catch (err) {
    console.warn("[Earth Engine] Skipping – credentials not found or invalid. Satellite imagery will be unavailable.");
  }
}

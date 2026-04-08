/**
 * importBirminghamData.ts
 *
 * Downloads the UCI Parking Birmingham dataset (CC BY 4.0, Stolfi 2017) and
 * imports it into historical_proxy_data, mapped to UNB general parking lots.
 *
 * Key transformations applied:
 *   1. sourceName → round-robined to UNB GeneralParking* lot UUIDs
 *      (commercial lots are closest in behaviour to UNB general lots)
 *   2. Timestamps remapped from 2016 → 2024 (+8 years, same month/day/time)
 *      Birmingham Oct–Dec 2016 aligns with UNB fall 2024 "classes"/"exams" period.
 *   3. occupancyPct = clamp(Occupancy / Capacity × 100, 0, 100)
 *   4. metadata.period set from the UNB academic calendar for the remapped date
 *      (required by fetchHistoricalSamples in prediction.service.ts)
 *
 * After import, regenerate residual corrections:
 *   npm run gen-residuals
 *
 * Usage:
 *   npm run import-birmingham           # skip if already imported
 *   npm run import-birmingham -- --clear # clear existing, then reimport
 *
 * Citation:
 *   Stolfi, D. (2017). Parking Birmingham [Dataset]. UCI ML Repository.
 *   https://doi.org/10.24432/C51K5Z  (CC BY 4.0)
 */

import "reflect-metadata";
import path from "path";
import fs from "fs";
import https from "https";
import { execSync } from "child_process";
import { AppDataSource } from "../src/db/data-source";
import { HistoricalProxyData } from "../src/modules/historical/historical.entity";
import { ParkingLot } from "../src/modules/parkingLots/parkingLot.entity";

// ─── Config ───────────────────────────────────────────────────────────────────

const DATASET_URL =
  "https://archive.ics.uci.edu/static/public/482/parking+birmingham.zip";
const TMP_DIR = path.join(__dirname, "..", "data", "birmingham_tmp");
const ZIP_PATH = path.join(TMP_DIR, "parking_birmingham.zip");

/** Year offset to remap Birmingham 2016 → UNB fall 2024. */
const YEAR_SHIFT = 8;

/** Marker written to metadata so we can find/delete these records later. */
const SOURCE_TAG = "birmingham_uci";

// ─── UNB academic calendar (fall 2024 subset covers Birmingham date range) ───

const CALENDAR: Array<{ start: string; end: string; period: string }> = [
  { start: "2024-09-09", end: "2024-10-13", period: "classes" },
  { start: "2024-10-14", end: "2024-10-14", period: "holiday" },
  { start: "2024-10-15", end: "2024-11-10", period: "classes" },
  { start: "2024-11-11", end: "2024-11-11", period: "holiday" },
  { start: "2024-11-12", end: "2024-12-06", period: "classes" },
  { start: "2024-12-07", end: "2024-12-08", period: "reading_week" },
  { start: "2024-12-09", end: "2024-12-20", period: "exams" },
];

function getPeriod(ymd: string): string {
  for (const e of CALENDAR) {
    if (ymd >= e.start && ymd <= e.end) return e.period;
  }
  return "classes"; // fallback: Birmingham data is in class-equivalent period
}

function getLotType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("staff")) return "staff";
  if (n.includes("resident")) return "resident";
  if (n.includes("timed")) return "timed";
  if (n.includes("phd")) return "phd";
  return "general";
}

// ─── Download ─────────────────────────────────────────────────────────────────

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(u: string, redirectCount = 0) {
      if (redirectCount > 5) { reject(new Error("Too many redirects")); return; }
      https
        .get(u, (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302) &&
            res.headers.location
          ) {
            get(res.headers.location, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} from ${u}`));
            return;
          }
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close(resolve as () => void));
          file.on("error", (err) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        })
        .on("error", reject);
    }
    get(url);
  });
}

// ─── ZIP extraction ───────────────────────────────────────────────────────────

function extractZip(zipPath: string, destDir: string): void {
  try {
    // Windows (PowerShell)
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: "inherit" }
    );
  } catch {
    // Linux / macOS fallback
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "inherit" });
  }
}

function findCSV(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
      return fullPath;
    if (entry.isDirectory()) {
      const found = findCSV(fullPath);
      if (found) return found;
    }
  }
  return null;
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

interface BirminghamRow {
  SystemCodeNumber: string;
  Capacity: number;
  Occupancy: number;
  LastUpdated: Date;
}

function parseCSV(content: string): BirminghamRow[] {
  const lines = content.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const rows: BirminghamRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
    const raw: Record<string, string> = {};
    header.forEach((h, i) => {
      raw[h] = cols[i] ?? "";
    });

    const capacity = parseInt(raw["Capacity"], 10);
    const occupancy = parseInt(raw["Occupancy"], 10);
    const lastUpdated = new Date(raw["LastUpdated"]);

    if (
      !raw["SystemCodeNumber"] ||
      isNaN(capacity) ||
      capacity <= 0 ||
      isNaN(occupancy) ||
      occupancy < 0 ||
      isNaN(lastUpdated.getTime())
    )
      continue;

    rows.push({
      SystemCodeNumber: raw["SystemCodeNumber"],
      Capacity: capacity,
      Occupancy: Math.min(occupancy, capacity), // clamp sensor overflows
      LastUpdated: lastUpdated,
    });
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const clear = process.argv.includes("--clear");

  await AppDataSource.initialize();
  console.log("DB connected.");

  const histRepo = AppDataSource.getRepository(HistoricalProxyData);
  const lotRepo = AppDataSource.getRepository(ParkingLot);

  // ── Find UNB general lots to receive Birmingham data ──
  const allLots = await lotRepo.find();
  const generalLots = allLots.filter((l) => getLotType(l.name) === "general");
  if (generalLots.length === 0) {
    console.error("No general parking lots found. Run `npm run seed` first.");
    process.exit(1);
  }
  console.log(
    `UNB general lots (${generalLots.length}): ${generalLots.map((l) => l.name).join(", ")}`
  );

  // ── Guard: skip if already imported ──
  const existingCount = await histRepo
    .createQueryBuilder("h")
    .where("json_extract(h.metadata, '$.source') = :s", { s: SOURCE_TAG })
    .getCount();

  if (existingCount > 0 && !clear) {
    console.log(
      `Birmingham data already present (${existingCount} records). Use --clear to reimport.`
    );
    await AppDataSource.destroy();
    return;
  }

  if (clear && existingCount > 0) {
    await histRepo
      .createQueryBuilder()
      .delete()
      .where("json_extract(metadata, '$.source') = :s", { s: SOURCE_TAG })
      .execute();
    console.log(`Cleared ${existingCount} existing Birmingham records.`);
  }

  // ── Download ──
  fs.mkdirSync(TMP_DIR, { recursive: true });
  if (!fs.existsSync(ZIP_PATH)) {
    console.log(`Downloading from UCI (${DATASET_URL})...`);
    await downloadFile(DATASET_URL, ZIP_PATH);
    console.log("Download complete.");
  } else {
    console.log("Using cached zip.");
  }

  // ── Extract ──
  let csvPath = findCSV(TMP_DIR);
  if (!csvPath) {
    console.log("Extracting zip...");
    extractZip(ZIP_PATH, TMP_DIR);
    csvPath = findCSV(TMP_DIR);
  }
  if (!csvPath) {
    throw new Error(`No CSV found in ${TMP_DIR} after extraction.`);
  }
  console.log(`CSV: ${csvPath}`);

  // ── Parse ──
  const rows = parseCSV(fs.readFileSync(csvPath, "utf-8"));
  const uniqueCodes = [...new Set(rows.map((r) => r.SystemCodeNumber))];
  console.log(
    `Parsed ${rows.length} valid rows from ${uniqueCodes.length} Birmingham lots.`
  );

  if (rows.length === 0) {
    console.error("No valid rows. Check CSV format.");
    await AppDataSource.destroy();
    return;
  }

  // ── Round-robin assign Birmingham lots → UNB general lot UUIDs ──
  // All Birmingham NCP car parks are "general" in behaviour.
  // Multiple Birmingham lots are pooled into each UNB general lot to
  // increase sample count for residual calculations.
  const codeToLotId = new Map<string, string>();
  uniqueCodes.forEach((code, i) => {
    codeToLotId.set(code, generalLots[i % generalLots.length].id);
  });

  console.log("\nBirmingham → UNB lot mapping:");
  for (const [code, lotId] of codeToLotId) {
    const lot = generalLots.find((l) => l.id === lotId)!;
    console.log(`  ${code.padEnd(18)} → ${lot.name}`);
  }
  console.log();

  // ── Insert in batches ──
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const entities = batch.map((r) => {
      // Remap timestamp: 2016 → 2024 (same month/day/hour)
      // Birmingham Oct–Dec 2016 maps to UNB fall 2024 "classes"/"exams"
      const remapped = new Date(r.LastUpdated);
      remapped.setFullYear(remapped.getFullYear() + YEAR_SHIFT);

      const ymd = remapped.toISOString().slice(0, 10);
      const dow = remapped.getUTCDay();
      const period = getPeriod(ymd);
      const weekend = dow === 0 || dow === 6;
      const occupancyPct =
        Math.round((r.Occupancy / r.Capacity) * 1000) / 10; // 1 d.p.

      return histRepo.create({
        sourceName: codeToLotId.get(r.SystemCodeNumber)!,
        recordedAt: remapped,
        occupancyPct,
        snapshot: {
          birminghamCode: r.SystemCodeNumber,
          birminghamCapacity: r.Capacity,
          birminghamOccupancy: r.Occupancy,
        },
        metadata: {
          source: SOURCE_TAG,
          lotType: "general",
          period,
          weekend,
          eventSize: "none",
          originalYear: r.LastUpdated.getFullYear(),
        },
      });
    });

    await histRepo.save(entities);
    inserted += entities.length;
    process.stdout.write(`\rInserting... ${inserted}/${rows.length}`);
  }

  console.log(
    `\n\nImport complete. ${inserted} records written across ${generalLots.length} UNB general lots.`
  );

  // ── Summary ──
  const periodCounts: Record<string, number> = {};
  for (const r of rows) {
    const remapped = new Date(r.LastUpdated);
    remapped.setFullYear(remapped.getFullYear() + YEAR_SHIFT);
    const p = getPeriod(remapped.toISOString().slice(0, 10));
    periodCounts[p] = (periodCounts[p] ?? 0) + 1;
  }
  console.log("\nRecords by academic period:");
  for (const [p, n] of Object.entries(periodCounts)) {
    console.log(`  ${p.padEnd(14)} ${n.toLocaleString()}`);
  }

  console.log("\nNext step:");
  console.log("  npm run gen-residuals");

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

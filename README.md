# UNB Saint John Parking Digital Twin

Digital twin of all 16 UNBSJ parking lots. Models and predicts parking demand across campus, recommends the best lot and spot per building or class schedule, and supports what-if event scenario analysis.

**BE** is in `BE/`, **FE** is in `FE/`. API spec is in `BE/openapi.yaml`. Design and SVG export notes are in `docs/figma.md`.

---

## Running locally

**First time only** — run the setup script to install dependencies, seed the database, and pull in historical data:

```bash
# Windows
setup.bat

# Mac / Linux
chmod +x setup.sh && ./setup.sh
```

Then start the servers (same as always):

```bash
# Terminal 1
cd BE && npm run dev

# Terminal 2
cd FE && npm run dev
```

Runs at **http://localhost:5173**. Backend runs on port 3000.

---

## Environment variables

Copy the example files on first run (the setup script does this automatically):

```bash
cp BE/.env.example BE/.env
cp FE/.env.example FE/.env
```

Defaults work out of the box for local development. See the example files for production and Google Earth Engine options.

---

## Google Earth Engine

Map tiles require a GEE service account. Without one the map won't load but everything else works fine. Place your service account key at `BE/serviceAccount.json` (gitignored), or set `EARTH_ENGINE_CREDENTIALS_JSON` in `BE/.env` to the full JSON on one line. The service account must be registered as a GEE user at code.earthengine.google.com.

- **Tiles (proxied):** `GET /api/earth-engine/tiles/{z}/{x}/{y}?asset=...`
- **Thumbnail:** `GET /api/earth-engine/thumbnail?asset=...`

---

## Lot maps (SVG mini-maps)

Each lot has a custom SVG in `FE/src/images/svgs/{LotName}.svg` built from satellite imagery. The seed reads `data-spot-label` attributes (e.g. `A-001`, `B-002`) and creates one `ParkingSpot` per element. Layers with `"BG"` in the name are skipped. At runtime spots are recoloured based on live status — green = free, red = occupied. See `docs/figma.md` for the Figma process and the SVG export plugin needed to preserve element IDs.

---

## Scripts

All scripts run from `BE/`:

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server with auto-reload (port 3000) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled build |
| `npm test` | Run Jest test suite |
| `npm run seed` | Full DB init — lots, spots, buildings, distances |
| `npm run seed-replace` | Rebuild parking tables only, preserve users and courses |
| `npm run seed-courses` | Load `data/scraped-courses.json` into DB |
| `npm run populate-spots` | Tag accessible spots from SVG fill colours |
| `npm run recalc-distances` | Recompute per-spot distances from label parsing |
| `npm run gen-historical` | Generate synthetic historical occupancy records |
| `npm run import-birmingham` | Download and import UCI Birmingham real parking data |
| `npm run gen-residuals` | Compute DDM residual corrections |
| `npm run gen-event-residuals` | Compute event and weekend residual corrections |

To re-scrape course data for a new semester: `npm run scrape-courses -- --token "TOKEN" --cookie "COOKIE"` (copy both from DevTools after logging in at selfservice.unb.ca), then `npm run seed-courses -- --replace`.

---

## What's in BE

- **TypeScript, TypeORM, SQLite** (local) / **PostgreSQL** (production) — entities in `*.entity.ts`. Set `APP_MODE=production` to switch to Postgres via `DATABASE_CONNECTION_STRING`.
- **Zod** for request validation — each module has a schema file.
- **Thin controllers** — validate, call service, send response. Logic lives in services.
- **Prediction engine** — hybrid process-based model with a data-driven residual correction layer. Residuals are stored in `lot_occupancy_corrections` and weighted by `tanh(nSamples/10)`.
- **Campus parameters** — behavioural constants (carpool rate, absence rate, etc.) stored in `campus_parameters` table and applied at prediction time.

Under `BE/src/` you have `db/`, `middleware/`, `config/`, `utils/`, and `modules/`. Each module has its own entity, schema, service, controller, and route.

---

## API

Full spec: `BE/openapi.yaml` — open at [editor.swagger.io](https://editor.swagger.io/) or run `npx @redocly/cli preview BE/openapi.yaml`.

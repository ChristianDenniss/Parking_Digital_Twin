# UNB Saint John Parking Digital Twin

Digital twin of all 16 UNBSJ parking lots. Models and predicts parking demand across campus, recommends the best lot and spot per building or class schedule, and supports what-if event scenario analysis.

**BE** is in `BE/`, **FE** is in `FE/`. API spec is in `BE/openapi.yaml`. Design and SVG export notes are in `docs/figma.md`.

## Deployment

| Piece | Where | Notes |
|---|---|---|
| **Frontend** | Vercel | Set `VITE_API_URL` at build time to the Fly API base |
| **Backend** | Fly.io | Set `APP_MODE=production`, `DATABASE_URL`/`DATABASE_CONNECTION_STRING`, `CORS_ALLOWED_ORIGINS` |
| **Database** | Supabase (Postgres) | Used when backend is in production mode and a DB URL is set |
| **Cache** | Redis (optional) | Set `REDIS_URL`; without it caching is disabled. Health: `GET /api/cache/health` |

Local dev uses SQLite + the Vite proxy — no Supabase needed. `APP_MODE` defaults to `local` unless `NODE_ENV=production`.

---

---

## Running locally

**First time only** — install dependencies and initialize backend data:

```bash
# Terminal 1 (repo root)
cd BE && npm install && npm run seed && npm run import-birmingham

# Terminal 2 (repo root)
cd FE && npm install
```

Then start the servers (same as always):

```bash
# Terminal 1
cd BE && npm run dev

# Terminal 2
cd FE && npm run dev
```

Runs at **http://localhost:5173**. Start the backend first so the Vite `/api` proxy can reach `http://localhost:3000` (override with `VITE_API_PROXY_TARGET`). Set `VITE_DEV_REMOTE_API=true` to point dev at a remote API instead of the local proxy.

---

## Environment variables

### Backend (`BE/.env`)

Local dev works with defaults for most, but these are the important values:

- `APP_MODE` (optional locally): defaults to local mode if not set.
- Google Earth Engine credentials (choose one):
  - `EARTH_ENGINE_CREDENTIALS_JSON` (full service account JSON on one line), or
  - `BE/serviceAccount.json` file (gitignored).

### Frontend (`FE/.env`)

- `VITE_API_URL`: backend base URL used by the frontend (important for remote API/CORS in deployed setups).

### Production environment (backend)

Set these in your host (for example Fly):

- `APP_MODE=production`
- `DATABASE_CONNECTION_STRING` (or `DATABASE_URL`)
- `CORS_ALLOWED_ORIGINS`
- Earth Engine service account fields:
  - `EARTH_ENGINE_TYPE`
  - `EARTH_ENGINE_PROJECT_ID`
  - `EARTH_ENGINE_PRIVATE_KEY_ID`
  - `EARTH_ENGINE_PRIVATE_KEY`
  - `EARTH_ENGINE_CLIENT_EMAIL`
  - `EARTH_ENGINE_CLIENT_ID`
  - `EARTH_ENGINE_AUTH_URI`
  - `EARTH_ENGINE_TOKEN_URI`
  - `EARTH_ENGINE_AUTH_PROVIDER_X509_CERT_URL`
  - `EARTH_ENGINE_CLIENT_X509_CERT_URL`
  - `EARTH_ENGINE_UNIVERSE_DOMAIN`

---

## Google Earth Engine

Map tiles require a GEE service account. Without one the map won't load but everything else works fine. Place your service account key at `BE/serviceAccount.json` (gitignored), or set `EARTH_ENGINE_CREDENTIALS_JSON` in `BE/.env` to the full JSON on one line. The service account must be registered as a GEE user at code.earthengine.google.com.

- **Tiles (proxied):** `GET /api/earth-engine/tiles/{z}/{x}/{y}?asset=...`
- **Thumbnail:** `GET /api/earth-engine/thumbnail?asset=...`

---

## Google Earth

Google Earth was used to validate and present the mapped walking network used by the recommendation model; 192 route segments across campus (16 parking lots to 12 buildings each). It helps verify route realism, spot-check building-to-lot paths, and communicate results visually during demos.

Google Earth Web Project Link:
https://earth.google.com/web/data=MicKJQojCiExeXN6cWtCMmoxbU4zTGh3ekU0cWUwR3FiQjM0d21MRWk

---

## Lot maps (SVG mini-maps)

Each lot has a custom SVG in `FE/src/images/svgs/{LotName}.svg` built from satellite imagery. The seed reads `data-spot-label` attributes (e.g. `A-001`, `B-002`) and creates one `ParkingSpot` per element. Layers with `"BG"` in the name are skipped. At runtime spots are recoloured based on live status — green = free, red = occupied. See `docs/figma.md` for the Figma process and the SVG export plugin needed to preserve element IDs.

---

## PowerPoint / Slide Deck

Project power point presentation slides are in `docs/CS4555.pptx`. Link to online file below.
https://1drv.ms/p/c/3c4efb58d9bd8ff5/IQATHBtGu1aQSJ85u708hbLbAUKdpLPqLmQu78At_tli4VY?e=xxlmeB

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

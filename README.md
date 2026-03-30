# UNB Saint John Parking Digital Twin

Digital twin for campus parking at UNB Saint John. Right now we’re on the MVP: simulated per-spot data (fake sensors), historical proxy data for training, plus students and classes so we can tie usage to schedules later.

**BE** is in `BE/`, **FE** is in `FE/`. API and data shapes are in `BE/openapi.yaml`. Design (Figma) and SVG export notes are in **`docs/figma.md`**.

---

## Deployment (My current setup)

| Piece | Where it runs | Notes |
|--------|----------------|--------|
| **Frontend** | **Vercel** | Static build; must set **`VITE_API_URL`** at build time to the Fly API base |
| **Backend** | **Fly.io** | Node process; set **`APP_MODE=production`** (Fly secret or env), **`DATABASE_URL`** or **`DATABASE_CONNECTION_STRING`** (Supabase Postgres), **`CORS_ALLOWED_ORIGINS`** (your Vercel app URL(s), comma-separated), plus auth/JWT secrets as needed. |
| **Database** | **Supabase** (Postgres) | Used when the backend is in **production** mode and a DB URL is configured. |
| **Cache (Redis)** | **Not wired in prod yet (planned)** | The backend already supports optional caching via **`REDIS_URL`** (`BE/src/utils/cache.ts`). If unset, the app runs with **caching disabled** (warning in logs). When you add Redis (e.g. **Upstash**, **Fly Redis**, or Docker locally), set **`REDIS_URL`** on Fly and redeploy; use the same variable in **`BE/.env`** for local testing. Health: **`GET /api/cache/health`**. |

**Local development** does not need to mirror that stack: the backend defaults to **local mode** (see below) and uses a **SQLite** file under `BE/data/`, while the Vite dev server **proxies** `/api` to `http://localhost:3000` so the browser avoids CORS.

---

## Backend: local vs production (`APP_MODE`)

The backend chooses behavior from **`APP_MODE`** and **`NODE_ENV`** (see `BE/src/config/appMode.ts`):

| Mode | How it is selected | Database | CORS |
|------|---------------------|----------|------|
| **local** | `APP_MODE=local`, or `APP_MODE` unset and `NODE_ENV` is not `production` | Always **SQLite** (`BE/data/database.sqlite`); Supabase URLs in `.env` are ignored for TypeORM | Permissive (reflects request origin; easy mobile/LAN testing) |
| **production** | `APP_MODE=production`, or `APP_MODE` unset and `NODE_ENV=production` | **Postgres** when `DATABASE_URL` / `DATABASE_CONNECTION_STRING` is set (e.g. Supabase) | **`CORS_ALLOWED_ORIGINS`** whitelist (comma-separated); if empty, all origins are allowed |

For **Fly**, set a secret such as **`APP_MODE=production`** so production behavior does not depend on how `NODE_ENV` is set. **`APP_MODE` is only read by the backend**; the frontend does not use it.

---

## Lot maps (SVG heat maps)

For lots that have an SVG in **`FE/src/images/svgs/{LotName}.svg`** (e.g. `TimedParking1.svg`), the seed reads spot layers from the file and creates one parking spot per layer (in order). Layers with `"BG"` in the name are ignored. Each spot layer should have **`data-spot-label`** (e.g. `A-001`, `B-002`). On the lot detail page, the SVG is shown as a heat map (green = free, red = taken) and each layer is clickable to toggle that spot. **Figma:** [Parking Lot SVGs](https://www.figma.com/design/QDDoFP63VBhhGUEAbM6J0H/Parking-Lot-SVGs?node-id=0-1&t=OmokzgOiqOu1ibUh-1). Export and workflow notes: **`docs/figma.md`**.

---

## Realistic Campus Walking Paths (Google Earth)

For every parking lot in the database (16 total), there are routes mapped to every building (12 total). Each route was manually drawn in Google Earth to accurately reflect how a real student would walk across the UNB Saint John campus.

These paths were created carefully over many hours to ensure realistic traversal (sidewalks, paths, and natural walking flow), rather than straight-line or computed distances.

You can view an image of the mapped routes here:  
**`DTProj/docs/CampusPathMapping.png`**

You can also explore the full interactive map:  
**Google Earth:** https://earth.google.com/earth/d/1yszqkB2j1mN3LhwzE4qe0GqbB34wmLEi?usp=sharing

The complete dataset of all routes and distances has been manually exported as a KML file located at:  
**`DTProj/BE/data/DTParkingDistances.kml`**

---

## Running the backend

```bash
cd BE
npm install
# Create BE/.env (gitignored) with any secrets you need locally.
npm run seed    # 16 lots; originally believed to be 1,170 spots but recounted to 1,231 (BE/data/ParkingLotINFO.txt); spots from SVG where present else fallback; buildings and lot–building distances
npm run build
npm start
```

Runs on port **3000** by default (`PORT` env overrides). With default **local** mode, seeding and runtime use **SQLite**; you do not need Supabase configured on your laptop for a normal dev loop. **Redis** is optional: without **`REDIS_URL`**, caching stays off (see deployment table above).

**Courses** are not in the seed. To scrape sections (time, room, building, enrollment) from UNB self-service: `npm run scrape-courses -- --token "TOKEN" --cookie "COOKIE"` (paste from DevTools after logging in at selfservice.unb.ca; output `data/scraped-courses.json`). Then `npm run seed-courses -- data/scraped-courses.json` (add `--replace` to clear and re-import). For dev with auto-reload use **`npm run dev`**.

**Production-oriented local test:** set **`APP_MODE=production`** in `BE/.env` if you need to exercise Postgres and strict CORS against a real connection string (optional).

A simulator updates ~5% of parking spot statuses every 5 seconds so the lot doesn’t sit static. Override with `SIM_OCCUPANCY` (0–1) if you want a different average occupancy.

### Google Earth Engine (thumbnails / map tiles)

We used to keep a **`BE/serviceAccount.json`** file (gitignored) for local Earth Engine auth. That worked, but credentials on disk are easy to mishandle and don’t match how **Fly** and other hosts expect secrets. The supported approach now is **environment variables** (12-factor style): same code locally and in production, no key file in the repo, secrets only in **`.env`** (local, gitignored) or the platform’s secret store.

Credentials are resolved in this order (see `BE/src/modules/earthEngine/earthEngine.service.ts`):

1. **`EARTH_ENGINE_SERVICE_ACCOUNT_JSON`** — full service-account JSON as a single string (useful if your host accepts one secret).
2. **`EARTH_ENGINE_CLIENT_EMAIL`** + **`EARTH_ENGINE_PRIVATE_KEY`** — recommended for **Fly secrets** / **`BE/.env`**. Store the private key with newline characters as the two-character sequence **`\n`** in the env value; the backend expands them before auth.
3. **Optional** with (2): **`EARTH_ENGINE_PROJECT_ID`**, **`EARTH_ENGINE_PRIVATE_KEY_ID`**, and the other `EARTH_ENGINE_*` URLs from the JSON if you need a full credential object shape.
4. **File fallback (optional, e.g. local experiments):** **`GOOGLE_APPLICATION_CREDENTIALS`** or **`EARTH_ENGINE_SERVICE_ACCOUNT_PATH`** pointing at a JSON key file, or **`BE/serviceAccount.json`** if it still exists (gitignored; not the preferred workflow).

The service account **must be registered as a user** in your Google Earth Engine project.

- **Thumbnail:** `GET /api/earth-engine/thumbnail?asset=...` — redirects to a static PNG/JPG.
- **Tiles (proxied):** `GET /api/earth-engine/tiles/{z}/{x}/{y}?asset=...` — serves map tiles through the backend so the client never sees mapid/token. Use this as the tile URL in your map library, e.g.  
  `https://your-api/api/earth-engine/tiles/{z}/{x}/{y}?asset=USGS/SRTMGL1_003`  
  You can protect this route with your auth middleware so only logged-in users get tiles.
- **Map ID (optional):** `GET /api/earth-engine/mapid?asset=...` — returns mapid/token for client-side tile usage; prefer the tile proxy above to keep credentials server-side.

---

## Running the frontend (MVP)

```bash
cd FE
npm install
npm run dev
```

Runs at **http://localhost:5173**. Start the backend first so the Vite **`/api` proxy** can reach **`http://localhost:3000`** (override proxy target with **`VITE_API_PROXY_TARGET`** if needed).

In **`npm run dev`**, the app normally calls **`/api/...` on the dev server** (same origin), so you avoid CORS even if `VITE_API_URL` in `.env` points at production. To force the dev app to talk to a **remote** API instead, set **`VITE_DEV_REMOTE_API=true`**. **Production builds** (e.g. on Vercel) use **`VITE_API_URL`** as the API base. See `FE/README.md` for env details.

---

## What’s in BE

- **TypeScript, TypeORM** – **SQLite** in local mode; **Postgres** (e.g. Supabase) in production mode when a database URL is set. Entities live in `*.entity.ts` with the usual decorators.
- **Zod** for request validation – each module has a schema file with create/update shapes.
- **Thin controllers** – they validate, call the service, send the response. Logic lives in **services**.
- **Routes** – just wire method + path to a controller; no logic in the route files.

Under `BE/src/` you have `db/` (TypeORM data source), `middleware/`, `utils/`, and `modules/`. Each module (parkingLots, parkingSpots, parkingSpotLogs, historical, users, students, classes, classSchedule, buildings, earthEngine) has its own entity, schema, service, controller, and route. The simulator is a separate module with no HTTP routes.

---

## API

Full spec is in **`BE/openapi.yaml`**. Open it in [Swagger Editor](https://editor.swagger.io/) or run `npx @redocly/cli preview BE/openapi.yaml` to browse. Keep the spec updated when you add or change endpoints.


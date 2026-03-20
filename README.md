# UNB Saint John Parking Digital Twin

Digital twin for campus parking at UNB Saint John. Right now we’re on the MVP: simulated per-spot data (fake sensors), historical proxy data for training, plus students and classes so we can tie usage to schedules later.

**BE** is in `BE/`, **FE** is in `FE/`. API and data shapes are in `BE/openapi.yaml`. Design (Figma) and SVG export notes are in **`docs/figma.md`**.

---

## Lot maps (SVG heat maps)

For lots that have an SVG in **`FE/src/images/svgs/{LotName}.svg`** (e.g. `TimedParking1.svg`), the seed reads spot layers from the file and creates one parking spot per layer (in order). Layers with `"BG"` in the name are ignored. Each spot layer should have **`data-spot-label`** (e.g. `A-001`, `B-002`). On the lot detail page, the SVG is shown as a heat map (green = free, red = taken) and each layer is clickable to toggle that spot. See `docs/figma.md` for the Figma design and export tips.

---

## Running the backend

```bash
cd BE
npm install
npm run seed    # 16 lots; originally believed to be 1,170 spots but recounted to 1,231 (BE/data/ParkingLotINFO.txt); spots from SVG where present else fallback; buildings and lot–building distances
npm run build
npm start
```

Runs on port 3000. **Courses** are not in the seed. To scrape sections (time, room, building, enrollment) from UNB self-service: `npm run scrape-courses -- --token "TOKEN" --cookie "COOKIE"` (paste from DevTools after logging in at selfservice.unb.ca; output `data/scraped-courses.json`). Then `npm run seed-courses -- data/scraped-courses.json` (add `--replace` to clear and re-import). For dev with auto-reload use `npm run dev`.

A simulator updates ~5% of parking spot statuses every 5 seconds so the lot doesn’t sit static. Override with `SIM_OCCUPANCY` (0–1) if you want a different average occupancy.

### Google Earth Engine (thumbnails / map tiles)

To use the Earth Engine endpoints, put your **service account key** at `BE/serviceAccount.json` (or set `GOOGLE_APPLICATION_CREDENTIALS` or `EARTH_ENGINE_SERVICE_ACCOUNT_PATH` to its path). The service account **must be registered as a user** in your Google Earth Engine project.

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

Runs at http://localhost:5173. Start the backend first so the proxy can reach `http://localhost:3000`.

---

## What’s in BE

- **TypeScript, TypeORM, SQLite** – entities in `*.entity.ts` with the usual decorators.
- **Zod** for request validation – each module has a schema file with create/update shapes.
- **Thin controllers** – they validate, call the service, send the response. Logic lives in **services**.
- **Routes** – just wire method + path to a controller; no logic in the route files.

Under `BE/src/` you have `db/` (TypeORM data source), `middleware/`, `utils/`, and `modules/`. Each module (parkingLots, parkingSpots, parkingSpotLogs, historical, users, students, classes, classSchedule, buildings, earthEngine) has its own entity, schema, service, controller, and route. The simulator is a separate module with no HTTP routes.

---

## API

Full spec is in **`BE/openapi.yaml`**. Open it in [Swagger Editor](https://editor.swagger.io/) or run `npx @redocly/cli preview BE/openapi.yaml` to browse. Keep the spec updated when you add or change endpoints.


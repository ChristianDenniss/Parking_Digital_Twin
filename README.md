# UNB Saint John Parking Digital Twin

Digital twin for campus parking at UNB Saint John. Right now we’re on the MVP: simulated per-spot data (fake sensors), historical proxy data for training, plus students and classes so we can tie usage to schedules later.

**BE** is in `BE/`, **FE** will go in `FE/`. API and data shapes are in `BE/openapi.yaml`.

---

## Running the backend

```bash
cd BE
npm install
npm run seed    # one lot, 24 spots (SQLite)
npm run build
npm start
```

Runs on port 3000. For dev with auto-reload use `npm run dev`.

A simulator updates ~5% of parking spot statuses every 5 seconds so the lot doesn’t sit static. Override with `SIM_OCCUPANCY` (0–1) if you want a different average occupancy.

---

## What’s in BE

- **TypeScript, TypeORM, SQLite** – entities in `*.entity.ts` with the usual decorators.
- **Zod** for request validation – each module has a schema file with create/update shapes.
- **Thin controllers** – they validate, call the service, send the response. Logic lives in **services**.
- **Routes** – just wire method + path to a controller; no logic in the route files.

Under `BE/src/` you have `db/` (TypeORM data source), `middleware/`, `utils/`, and `modules/`. Each module (parkingLots, parkingSpots, parkingSpotLogs, historical, users, students, classes, classSchedule) has its own entity, schema, service, controller, and route. The simulator is a separate module with no HTTP routes.

---

## API

Full spec is in **`BE/openapi.yaml`**. Open it in [Swagger Editor](https://editor.swagger.io/) or run `npx @redocly/cli preview BE/openapi.yaml` to browse. Keep the spec updated when you add or change endpoints.


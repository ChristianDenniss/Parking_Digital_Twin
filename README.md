# UNB Saint John Parking Digital Twin

MVP: digital twin for campus parking using simulated per-spot data and historical proxy data for model training. Includes student and class data for schedule-aware use.

## Structure

- **BE/** – Backend (Express, JSON-file DB, simulated sensor updates)
  - **migrations/** – DB migrations (for future use)
  - **src/** – application code
    - **db/** – JSON store (read/write, getTable, setTable)
    - **middleware/** – notFound, errorHandler
    - **modules/** – parkingLots, parkingSpots, historical, students, classes, classSchedule, simulator
    - **utils/** – shared helpers
    - **types/** – JSDoc or TypeScript types (optional)
  - **data/** – `db.json`
  - **dist/** – build output (when added)
- **FE/** – Frontend (to be added)
- **SCHEMA.md** – Relational schema (implemented as `BE/data/db.json`)

## Backend (BE)

- **TypeScript** + **TypeORM** (SQLite); entities use decorators (`@Entity`, `@Column`, `@ManyToOne`, etc.).
- **Zod** schemas: `createXSchema` and `updateXSchema` (`.partial()` / `.extend()` where needed).
- **Thin controllers**: validate input, call service, send response.
- **Fat services**: all DB and business logic (repositories).
- **Routes**: no logic, only assign HTTP method/path to controller function.

```bash
cd BE
npm install
npm run seed   # seed one parking lot + 24 parking spots (SQLite)
npm run build
npm start      # server on http://localhost:3000 + simulator
# or for dev with reload:
npm run dev
```

### API

- `GET /api/health` – health check
- **Parking lots:** `GET/POST /api/parking-lots`, `GET /api/parking-lots/:id`, `GET /api/parking-lots/:id/spots`
- **Parking spots:** `GET/POST /api/parking-spots`, `GET /api/parking-spots/:id`, `PATCH /api/parking-spots/:id/status` (body: `{ "status": "occupied" | "empty" }`), query `?parkingLotId=...`
- **Historical:** `GET/POST /api/historical` (body: `sourceName`, `occupancyPct`, optional `snapshot`, `metadata`)
- **Students:** `GET/POST /api/students`, `GET /api/students/:id` (body: `studentId`, `email`, `name`, optional `year`)
- **Classes:** `GET/POST /api/classes`, `GET /api/classes/:id` (body: `classCode`, `startTime`, `endTime`, optional `name`, `term`)
- **Class schedule (enrollments):** `GET/POST /api/class-schedule`, `GET /api/class-schedule/:id`, `DELETE /api/class-schedule/:id`, query `?studentId=...` or `?classId=...` (body: `studentId`, `classId`, optional `term`, `section`)

Simulator runs every 5s and flips ~5% of parking spot statuses (tunable via `SIM_OCCUPANCY` 0–1).

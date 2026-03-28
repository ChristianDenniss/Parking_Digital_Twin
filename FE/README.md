# UNB Parking Digital Twin — Frontend (MVP)

React + TypeScript frontend for the parking digital twin API.

## Run

```bash
cd FE
npm install
npm run dev
```

Runs at **http://localhost:5173**. API requests under **`/api`** are proxied to **http://localhost:3000** (start the BE first). Override the proxy target with **`VITE_API_PROXY_TARGET`** if your API listens elsewhere.

## Build (e.g. Vercel)

```bash
npm run build
npm run preview   # serve dist/ locally
```

On **Vercel**, set **`VITE_API_URL`** to your deployed API base URL (e.g. `https://your-app.fly.dev`). The production bundle uses that value for all API calls. The root **`README.md`** describes the full Fly + Vercel + Supabase layout.

## What’s in the MVP

- **Lots** — List parking lots, click one to open its spots grid.
- **Lot detail** — Spots as a grid (green = empty, red = occupied). Click a spot to toggle status (calls `PATCH /api/parking-spots/:id/status`). Optional section filter.
- **Auth** — Register, login, view profile (`/api/users/me`). Token stored in `localStorage`.
- **Logs** — List parking spot status logs, optional filter by spot.

## Env

| Variable | When it applies | Purpose |
|----------|------------------|---------|
| **`VITE_API_URL`** | **Production build** (`npm run build` / Vercel) | Base URL of the API (e.g. Fly app). Required for the deployed site to reach the backend. |
| **`VITE_API_URL`** | **Development** | Ignored unless **`VITE_DEV_REMOTE_API=true`**. Default dev behavior uses same-origin **`/api/...`** and Vite’s proxy to localhost (no CORS). |
| **`VITE_DEV_REMOTE_API`** | Development only | Set to **`true`** to use **`VITE_API_URL`** from dev (e.g. test against Fly without a local BE). |
| **`VITE_API_PROXY_TARGET`** | Development only | Where the dev server proxies **`/api`** (default **`http://localhost:3000`**). |

See `src/config/apiBase.ts` for the exact rules.

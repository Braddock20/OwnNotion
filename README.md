# Life OS Backend

A dependency-free, single-user Personal Life Operating System backend. It runs on plain Node.js, so it can be deployed to Render or almost any Node host without a build toolchain.

## Included

Tasks, projects, goals, milestones, habits, streaks, challenges, calendar events, timetable, time tracking, daily planning, journal, notes, knowledge pages, ideas, decisions, waiting list, finance, budgets, savings goals, generic metrics, life areas, tags, history, search, dashboard, analytics, heatmaps, timeline, export/import, trash/restore, reminders and realtime SSE updates.

## Local

```bash
cp .env.example .env
npm start
```

Default: `http://localhost:10000`

## Persistence

Two storage modes, picked automatically at boot:

1. **JSON file** (default, dependency-free). Set `DATA_FILE` (e.g. `./data/life-os.json`).
2. **PostgreSQL** (recommended for production on Render). Set `DATABASE_URL` to a
   Postgres connection string. Neon (https://neon.tech) is the easiest option:
   - Create a free Neon project
   - Copy the pooled connection string (looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`)
   - On Render: Service → Environment → add `DATABASE_URL` = that string (mark as secret)
   - Redeploy. The server creates `life_records` and `life_history` tables on first boot and stores everything durably.

If `DATABASE_URL` is set but the connection fails, the server logs a warning and falls back to the JSON store so it still boots.

## Render deployment (durable)

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** → point at this repo (it reads `render.yaml`).
3. After the service is created, open it → **Environment** → add `DATABASE_URL` and paste your Neon connection string. Save. Render redeploys automatically.
4. Hit `https://<your-service>.onrender.com/api/v1/health` — the response includes `"storage":"postgres"` and `"db_ready":true` when everything is wired correctly.

Your data will survive spin-downs, restarts, and redeploys because it lives in Neon, not on Render's ephemeral disk.

## Security

No authentication is required by default. If the instance is publicly reachable, set `API_KEY`. Then send `x-api-key` with requests.

## Realtime

Subscribe to:

`GET /api/v1/realtime/stream`

It is Server-Sent Events (SSE), so browsers can receive live changes without a WebSocket dependency.

## API

Base: `/api/v1`

- `GET /health`
- `GET /dashboard/today`
- CRUD collections: `/tasks`, `/projects`, `/goals`, `/habits`, `/challenges`, `/events`, `/timetable`, `/time`, `/journal`, `/notes`, `/metrics`, `/life-areas`, `/ideas`, `/decisions`, `/waiting`, `/reminders`, `/tags`
- Finance: `/finance/transactions`, `/finance/budgets`, `/finance/savings`, `/finance/today`
- Actions: `/tasks/:id/complete`, `/tasks/:id/reopen`, `/habits/:id/check`, `/goals/:id/progress`, `/challenges/:id/items`, `/challenges/:id/items/:itemId/complete`, `/metrics/:id/entries`
- History: `/history`, `/history/:entityType/:entityId`
- Analytics: `/analytics/overview`, `/analytics/tasks`, `/analytics/habits`, `/analytics/finance`, `/analytics/life-areas`, `/analytics/heatmap`, `/analytics/timeline`
- Search: `/search?q=...`
- Export/import: `GET /export`, `POST /import`
- Realtime: `/realtime/stream`

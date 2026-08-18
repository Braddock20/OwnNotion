# Life OS Backend

A dependency-free, single-user Personal Life Operating System backend. It runs on plain Node.js, so it can be deployed to Render or almost any Node host without a build toolchain.

## Included

Tasks, projects, goals, milestones, habits, streaks, challenges, calendar events, timetable, time tracking, daily planning, journal, notes, knowledge pages, ideas, decisions, waiting list, finance, budgets, savings goals, generic metrics, life areas, tags, history, search, dashboard, analytics, heatmaps, timeline, export/import, trash/restore, reminders and realtime SSE updates.

## Local

```bash
cp .env.example .env
npm start
```

No `npm install` is required because the runtime uses only Node's standard library.

Default: `http://localhost:10000`

## Persistence

The default store is a JSON document at `DATA_FILE`. This is deliberately portable and requires no database service. On hosts with ephemeral filesystems, data disappears after a redeploy/restart. For durable production use, mount persistent storage or replace the store with PostgreSQL using the included `schema.sql` as the migration blueprint.

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

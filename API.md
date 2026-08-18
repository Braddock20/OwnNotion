# Life OS Backend — API Reference

Base URL: `https://ownnotion.onrender.com`
API prefix: `/api/v1`

Auth (optional): if `API_KEY` env var is set, send header `x-api-key: <key>` on every request.

All responses are JSON: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

---

## System

### `GET /api/v1/health`
Health probe. Returns storage mode and DB readiness.

```json
{
  "ok": true,
  "status": "healthy",
  "version": "1.0.0",
  "storage": "postgres",
  "db_ready": true,
  "time": "2026-08-18T16:56:49.071Z"
}
```

### `GET /api/v1`
Service info.

### `GET /api/v1/realtime/stream`
Server-Sent Events stream. Events: `connected`, `*.created`, `*.updated`, `history.created`, `system.imported`.

---

## Collections — generic CRUD

Every collection below supports:
- `GET /api/v1/{collection}` — list (with query filters)
- `GET /api/v1/{collection}/{id}` — fetch one
- `POST /api/v1/{collection}` — create
- `PATCH /api/v1/{collection}/{id}` — update
- `DELETE /api/v1/{collection}/{id}` — soft delete (sets `deleted_at`)

### Query params (list endpoints)
- `q=<text>` — full-text-ish search across the JSON
- `from=<YYYY-MM-DD>` / `to=<YYYY-MM-DD>` — date range
- `limit=<n>` — default 100, max 1000
- any field name as exact match, e.g. `?status=completed&life_area_id=...`

### Available collections
`tasks`, `projects`, `goals`, `milestones`, `habits`, `habit_logs`, `challenges`, `challenge_items`, `events`, `timetable`, `time`, `journal`, `notes`, `knowledge`, `ideas`, `decisions`, `waiting`, `transactions`, `budgets`, `savings`, `metrics`, `metric_entries`, `life-areas`, `tags`, `reminders`, `daily-plans`

### Examples

**List tasks:**
```bash
curl https://ownnotion.onrender.com/api/v1/tasks?status=planned&limit=50
```

**Create a task:**
```bash
curl -X POST https://ownnotion.onrender.com/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Read book","due_date":"2026-08-20","life_area_id":"...","priority":"high"}'
```

**Update a task:**
```bash
curl -X PATCH https://ownnotion.onrender.com/api/v1/tasks/<id> \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

**Delete a task:**
```bash
curl -X DELETE https://ownnotion.onrender.com/api/v1/tasks/<id>
```

---

## Required fields per collection

| Collection | Required fields |
|---|---|
| tasks | `title` |
| projects | `name` |
| goals | `title` |
| milestones | (none) |
| habits | `name` |
| habit_logs | (created by action, not directly) |
| challenges | `title`, `start_date` |
| challenge_items | `day_number`, `title` |
| events | `title`, `start_at` |
| timetable | `title`, `weekday`, `start_time`, `end_time` |
| time | `title`, `start_at` |
| journal | `content`, `entry_date` |
| notes | `title` |
| knowledge | `title` |
| ideas | `title` |
| decisions | `decision` |
| waiting | `item` |
| transactions | `kind` (`expense`/`income`/`transfer`), `amount_minor`, `category`, `transaction_date` |
| budgets | `name`, `category`, `amount_minor`, `start_date` |
| savings | `name`, `target_minor` |
| metrics | `name` |
| metric_entries | (created by action) |
| life-areas | `name` |
| tags | `name` |
| reminders | `title`, `remind_at` |
| daily-plans | `date` |

---

## Finance endpoints

### `GET /api/v1/finance/transactions`
Same as `GET /transactions` — alias.

### `GET /api/v1/finance/today?date=YYYY-MM-DD`
Today's money snapshot.

```json
{
  "ok": true,
  "data": {
    "date": "2026-08-18",
    "expenses_minor": 15000,
    "income_minor": 0,
    "net_minor": -15000,
    "transactions": [...]
  }
}
```
*Amounts are in minor units (e.g. cents). 15000 = $150.00.*

---

## Action endpoints

### `POST /api/v1/tasks/{id}/complete`
Marks a task as completed.

### `POST /api/v1/tasks/{id}/reopen`
Re-opens a completed task.

### `POST /api/v1/habits/{id}/check`
Body: `{ "date": "YYYY-MM-DD", "completed": true, "value": null, "note": "" }`
Logs a habit check-in.

### `POST /api/v1/goals/{id}/progress`
Body: `{ "current_value": 42 }`
Updates progress on a goal.

### `POST /api/v1/challenges/{id}/items`
Body: `{ "day_number": 1, "title": "...", "description": "..." }`
Adds an item to a challenge.

### `POST /api/v1/challenges/{id}/items/{itemId}/complete`
Marks a challenge item as done.

### `POST /api/v1/metrics/{id}/entries`
Body: `{ "value": 123, "recorded_at": "ISO", "note": "..." }`
Logs a metric entry.

---

## History

### `GET /api/v1/history?entity_type=tasks&entity_id=<id>&limit=50`
Recent activity across the whole system, or filtered to one entity.

### `GET /api/v1/history/{entityType}/{entityId}`
All history entries for a specific entity.

---

## Dashboard & analytics

### `GET /api/v1/dashboard/today`
Today's snapshot: tasks, habits, goals, events, spending, recent activity.

### `GET /api/v1/analytics/overview`
Counts: tasks, projects, goals, habits, transactions, history events.

### `GET /api/v1/analytics/tasks?days=30`
Daily task completion counts for the last N days.

### `GET /api/v1/analytics/finance`
Expense totals grouped by category.

### `GET /api/v1/analytics/habits`
Per-habit stats: total checks, current streak, best streak.

### `GET /api/v1/analytics/life-areas`
Per-life-area task counts.

### `GET /api/v1/analytics/heatmap`
Activity heatmap: `{ "YYYY-MM-DD": count, ... }`.

### `GET /api/v1/analytics/timeline?limit=200`
Most recent history entries (timeline view).

---

## Search

### `GET /api/v1/search?q=habit`
Full-text-ish search across all collections (excludes `habit_logs`, `challenge_items`, `metric_entries`).

Returns up to 200 matches, each as `{ type, ...record }`.

---

## Export / Import

### `GET /api/v1/export`
Full dump of all collections + history as JSON. Back this up!

### `POST /api/v1/import`
Body: a previously exported object `{ version, collections, history }`. **Wipes and replaces** everything.

---

## CORS

`CORS_ORIGIN` env var controls allowed origin. Default is `*` (any frontend can hit it). Lock it down by setting it to your frontend URL, e.g. `https://myapp.com`.

---

## Error codes

| Code | Meaning |
|---|---|
| `BAD_REQUEST` | 400 — malformed body or missing required field |
| `UNAUTHORIZED` | 401 — `x-api-key` missing or wrong |
| `NOT_FOUND` | 404 — unknown collection or item id |
| `METHOD_NOT_ALLOWED` | 405 — wrong HTTP verb for that path |
| `INTERNAL_ERROR` | 500 — server-side issue (check logs) |

---

## Quick reference (fetch)

```js
const API = 'https://ownnotion.onrender.com/api/v1';
const headers = { 'Content-Type': 'application/json' };
if (API_KEY) headers['x-api-key'] = API_KEY;

await fetch(`${API}/tasks?status=planned`).then(r => r.json());
await fetch(`${API}/tasks`, { method:'POST', headers, body: JSON.stringify({ title:'Buy milk' }) }).then(r => r.json());
await fetch(`${API}/tasks/${id}`, { method:'PATCH', headers, body: JSON.stringify({ status:'completed' }) }).then(r => r.json());
await fetch(`${API}/tasks/${id}`, { method:'DELETE' }).then(r => r.json());
```

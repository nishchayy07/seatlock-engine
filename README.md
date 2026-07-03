# SeatLock Engine

SeatLock Engine is a cinema booking demo built to show high-concurrency seat locking with Redis holds, PostgreSQL transactions, and a polling-based React dashboard.

## Tech Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: PostgreSQL via `pg`
- Cache/state: Redis via `ioredis`

## Project Structure

- `client/` - React UI
- `server/` - Express API, PostgreSQL schema, Redis hold logic

## Step-by-Step Implementation Guide

### 1. Install dependencies

Install dependencies in both packages after setting up the environment.

```bash
npm install
```

If your package manager does not install workspace dependencies automatically, run it inside `client/` and `server/` as well.

### 2. Prepare environment variables

Set these values for the server:

- `PORT=4000`
- `DATABASE_URL=postgresql://...`
- `REDIS_URL=redis://localhost:6379`

The client uses:

- `VITE_API_BASE_URL=http://localhost:4000`

### 3. Create the PostgreSQL schema

Use `server/src/db/schema.sql` to create:

- `movies` - movie metadata
- `seats` - seat inventory and confirmation state

The seat layout in this demo is rows `A-D` and columns `1-6`.

### 4. Seed the demo data

Run the seed script to create the sample movies and seats:

```bash
npm run seed -w server
```

This creates `Inception` and `Dune: Part Two` with a 4x6 seat map.

### 5. Start the API

Run the Express server:

```bash
npm run dev:server
```

API routes:

- `GET /api/movies` - list movies
- `GET /api/state?movieId=...&userId=...` - fetch seat grid state
- `POST /api/hold` - create a Redis hold with TTL 100 seconds
- `POST /api/confirm` - confirm a held seat inside a PostgreSQL transaction
- `POST /api/release` - release a held seat manually

### 6. Start the frontend

Run the Vite app:

```bash
npm run dev:client
```

The UI includes:

- movie selector
- seat grid
- color legend
- checkout panel
- live countdown timer from `01:40`

### 7. Understand the booking flow

1. User selects a movie.
2. Clicking an available seat calls `POST /api/hold`.
3. Redis stores a JSON hold payload with `EX 100`.
4. The grid polling refreshes every 2 seconds so other users see the hold as orange.
5. Clicking Confirm calls `POST /api/confirm`.
6. The server uses `SELECT ... FOR UPDATE` and a transaction to mark the seat confirmed.
7. Clicking Release or letting the timer hit zero calls `POST /api/release`.
8. The Redis key is removed and the seat returns to available if it was not confirmed.

## Redis and PostgreSQL Logic

### Hold

Redis command used:

```sql
SET seatlock:hold:{movieId}:{seatLabel} <payload> EX 100 NX
```

### Confirm

PostgreSQL locking flow:

```sql
BEGIN;
SELECT id, status FROM seats
WHERE movie_id = $1 AND seat_label = $2
FOR UPDATE;

UPDATE seats
SET status = 'confirmed', confirmed_by = $3, confirmed_at = NOW(), updated_at = NOW()
WHERE movie_id = $1 AND seat_label = $2;
COMMIT;
```

### Release

Redis release flow:

```sql
DEL seatlock:hold:{movieId}:{seatLabel}
```

## Notes

- This first version uses polling rather than SSE.
- SSE means Server-Sent Events: the server keeps a long-lived HTTP connection open and pushes updates to the browser.
- Polling every 2 seconds is easier to follow and is enough for the demo.

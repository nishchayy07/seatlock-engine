# Setup Guide

## Prerequisites

Before starting, ensure you have these installed:

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Redis (v6 or higher)

## Quick Start

### 1. Install Dependencies

From the root directory:

```bash
npm install
```

This will install dependencies for both client and server workspaces.

### 2. Configure Environment Variables

#### Server Configuration

Create `server/.env` from the example:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your database and Redis connection strings:

```env
PORT=4000
DATABASE_URL=postgresql://username:password@localhost:5432/seatlock_db
REDIS_URL=redis://localhost:6379
```

#### Client Configuration

Create `client/.env` from the example:

```bash
cp client/.env.example client/.env
```

The default values should work if your server runs on port 4000:

```env
VITE_API_BASE_URL=http://localhost:4000
```

### 3. Set Up the Database

#### Create the Database

```bash
createdb seatlock_db
```

Or using psql:

```sql
CREATE DATABASE seatlock_db;
```

#### Run the Schema

```bash
psql -d seatlock_db -f server/src/db/schema.sql
```

Or connect to your database and run the SQL from [server/src/db/schema.sql](server/src/db/schema.sql).

### 4. Seed Demo Data

```bash
npm run seed
```

This creates two movies (Inception and Dune: Part Two) with 24 seats each (4 rows × 6 columns).

### 5. Start Redis

Make sure Redis is running:

```bash
redis-server
```

Or if using Docker:

```bash
docker run -p 6379:6379 redis:7-alpine
```

### 6. Start the Development Servers

#### Start the API Server

```bash
npm run dev:server
```

The API will run on http://localhost:4000

#### Start the Frontend (in a new terminal)

```bash
npm run dev:client
```

The UI will run on http://localhost:5173

### 7. Test the Application

1. Open http://localhost:5173 in your browser
2. You'll see a unique user ID assigned automatically
3. Select a movie (Inception or Dune: Part Two)
4. Click an available seat (gray) to hold it
5. The seat turns yellow and a countdown timer starts (01:40)
6. Click "Confirm" to book the seat permanently (turns red)
7. Or click "Release" to free the seat

## Testing Concurrent Access

To test the hold mechanism with multiple users:

1. Open the app in multiple browser tabs or incognito windows
2. Each will get a different user ID
3. Try holding the same seat from different tabs
4. Observe how holds are enforced (orange when held by others)

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/movies` - List all movies
- `GET /api/state?movieId=1&userId=user-abc` - Get seat grid state
- `POST /api/hold` - Create a hold (100 second TTL)
- `POST /api/confirm` - Confirm a held seat
- `POST /api/release` - Release a held seat

## Architecture Highlights

### Redis Hold Logic

When a user clicks a seat:
- Redis stores: `seatlock:hold:{movieId}:{seatLabel}` → `{userId, expiresAt}`
- TTL: 100 seconds (auto-expires)
- NX flag: only set if key doesn't exist (prevents double-booking)

### PostgreSQL Transaction

When confirming a seat:
```sql
BEGIN;
SELECT id, status FROM seats 
WHERE movie_id = $1 AND seat_label = $2 
FOR UPDATE;  -- Row-level lock

UPDATE seats 
SET status = 'confirmed', confirmed_by = $3 
WHERE movie_id = $1 AND seat_label = $2;
COMMIT;
```

### Polling

The frontend polls `/api/state` every 2 seconds to:
- Update seat availability
- Show other users' holds
- Refresh countdown timers

## Troubleshooting

### Database Connection Error

Check your `DATABASE_URL` in `server/.env` and ensure PostgreSQL is running:

```bash
psql -d seatlock_db -c "SELECT 1"
```

### Redis Connection Error

Ensure Redis is running:

```bash
redis-cli ping
```

Should return `PONG`.

### Port Already in Use

If port 4000 or 5173 is taken, change them in:
- Server: `server/.env` → `PORT=4001`
- Client: `client/vite.config.js` → `server.port: 5174`

### Seats Not Showing

Run the seed script again:

```bash
npm run seed
```

## Next Steps

This demo uses polling. To improve it, consider:

- **Server-Sent Events (SSE)**: Push updates to clients instead of polling
- **WebSockets**: Two-way real-time communication
- **Rate Limiting**: Prevent abuse of hold endpoints
- **Payment Integration**: Add a payment step after confirmation
- **Admin Dashboard**: View all bookings and holds
- **Multiple Shows**: Add show times and dates

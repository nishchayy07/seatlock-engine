# SeatLock Engine Architecture

## Overview

SeatLock Engine demonstrates a real-world cinema booking system with high-concurrency seat locking. It combines Redis for temporary holds with PostgreSQL for permanent confirmations.

## System Architecture

```
┌─────────────────┐
│  React Client   │ ← Vite dev server (port 5173)
│  (Polling UI)   │
└────────┬────────┘
         │ HTTP REST
         │ (every 2s)
         ↓
┌─────────────────┐
│  Express API    │ ← Node.js server (port 4000)
│   + CORS        │
└────┬───────┬────┘
     │       │
     │       └──────────┐
     ↓                  ↓
┌─────────┐      ┌──────────┐
│  Redis  │      │ PostgreSQL│
│ (holds) │      │  (seats)  │
└─────────┘      └──────────┘
```

## Data Flow

### 1. Seat Hold (Temporary Lock)

```
User clicks seat → POST /api/hold
                    ↓
            Check PostgreSQL (seat.status)
                    ↓
            Redis SET NX EX 100
            key: seatlock:hold:{movieId}:{seatLabel}
            value: {userId, expiresAt}
                    ↓
            Return 200 OK (or 409 Conflict)
```

**Redis Command:**
```
SET seatlock:hold:1:A3 '{"userId":"user-xyz","expiresAt":1721095234}' EX 100 NX
```

- `EX 100` - Expires in 100 seconds
- `NX` - Only set if key doesn't exist (atomic check-and-set)

### 2. Seat Confirmation (Permanent Lock)

```
User clicks confirm → POST /api/confirm
                       ↓
              Check Redis hold (owns it?)
                       ↓
              BEGIN TRANSACTION
                       ↓
              SELECT ... FOR UPDATE  ← Row-level lock
                       ↓
              Check seat.status = 'available'
                       ↓
              UPDATE seats SET status='confirmed'
                       ↓
              COMMIT
                       ↓
              DEL Redis key
                       ↓
              Return 200 OK
```

**PostgreSQL Transaction:**
```sql
BEGIN;

-- Acquire row lock (blocks concurrent confirmations)
SELECT id, status FROM seats 
WHERE movie_id = $1 AND seat_label = $2 
FOR UPDATE;

-- Update if available
UPDATE seats 
SET status = 'confirmed', 
    confirmed_by = $3, 
    confirmed_at = NOW() 
WHERE movie_id = $1 AND seat_label = $2;

COMMIT;
```

### 3. State Polling (Live Updates)

```
Every 2 seconds → GET /api/state?movieId=1&userId=user-xyz
                   ↓
          SELECT * FROM seats WHERE movie_id = 1
                   ↓
          For each seat:
            - If status='confirmed' → uiStatus='confirmed'
            - Else check Redis hold
              - No hold → uiStatus='available'
              - Hold by me → uiStatus='your_hold'
              - Hold by other → uiStatus='other_hold'
                   ↓
          Return seat grid + hold metadata
```

## Race Condition Handling

### Scenario: Two users try to hold the same seat simultaneously

```
User A                    Redis                    User B
  |                         |                        |
  |--- SET NX EX 100 ------>|                        |
  |                         |<----- SET NX EX 100 ---|
  |<------ OK --------------|                        |
  |                         |------- nil ----------->|
  |                         |                        |
 ✅ Hold acquired          |                   ❌ Conflict
```

**Result:** Redis `NX` flag ensures atomicity. Only User A gets `OK`; User B gets `nil`.

### Scenario: User holds seat, another tries to confirm it

```
User A (holds)            PostgreSQL               User B
  |                          |                        |
  |                          |<---- BEGIN ------------|
  |                          |                        |
  |                          |<- SELECT FOR UPDATE ---|
  |                          |                        |
  |---- confirm ------------>|                        |
  |                          |  (User B blocked)      |
  |<-- BEGIN ----------------|                        |
  |                          |                        |
  |-- SELECT FOR UPDATE ---->|                        |
  |                          |                        |
  |-- UPDATE --------------->|                        |
  |                          |                        |
  |<-- COMMIT ---------------|                        |
  |                          |                        |
  |                          |-- returns rows ------->|
  |                          |                        |
  |                          |<-- status check -------|
  |                          |                        |
  |                          |--- 409 Conflict ------>|
  |                          |                        |
 ✅ Confirmed                                    ❌ Already confirmed
```

**Result:** `FOR UPDATE` creates a row lock. User B's transaction waits, then sees `status='confirmed'` and returns 409.

### Scenario: Hold expires while user is confirming

```
User                   Redis                   PostgreSQL
  |                      |                        |
  |---- hold ----------->|                        |
  |<--- OK (TTL 100s) ---|                        |
  |                      |                        |
  | ... 100 seconds ...  |                        |
  |                      |                        |
  |                      | (key auto-deleted)     |
  |                      |                        |
  |--- confirm --------->|                        |
  |                      |                        |
  |<--- GET returns null-|                        |
  |                      |                        |
  |<----- 409 Conflict --|                        |
  |                      |                        |
 ❌ Hold expired
```

**Result:** Server checks Redis hold before confirming. No hold = 409 Conflict.

## Database Schema

### movies

| Column       | Type         | Description                      |
|--------------|--------------|----------------------------------|
| id           | SERIAL       | Primary key                      |
| title        | TEXT         | Movie name (unique)              |
| description  | TEXT         | Synopsis                         |
| rows_count   | INT          | Seat grid rows (default: 4)      |
| cols_count   | INT          | Seat grid columns (default: 6)   |
| created_at   | TIMESTAMPTZ  | Creation timestamp               |
| updated_at   | TIMESTAMPTZ  | Last update timestamp            |

### seats

| Column        | Type         | Description                      |
|---------------|--------------|----------------------------------|
| id            | SERIAL       | Primary key                      |
| movie_id      | INT          | Foreign key → movies(id)         |
| seat_row      | CHAR(1)      | Row letter (A-D)                 |
| seat_col      | INT          | Column number (1-6)              |
| seat_label    | TEXT         | Display label (e.g., "A3")       |
| status        | TEXT         | 'available' or 'confirmed'       |
| confirmed_by  | TEXT         | User ID who confirmed            |
| confirmed_at  | TIMESTAMPTZ  | Confirmation timestamp           |
| created_at    | TIMESTAMPTZ  | Creation timestamp               |
| updated_at    | TIMESTAMPTZ  | Last update timestamp            |

**Constraints:**
- `UNIQUE (movie_id, seat_label)` - No duplicate labels per movie
- `UNIQUE (movie_id, seat_row, seat_col)` - No duplicate positions
- `CHECK (status IN ('available', 'confirmed'))` - Valid statuses only

## Redis Data Structure

### Key Pattern

```
seatlock:hold:{movieId}:{seatLabel}
```

Examples:
- `seatlock:hold:1:A3`
- `seatlock:hold:2:D6`

### Value Structure (JSON)

```json
{
  "movieId": 1,
  "seatLabel": "A3",
  "userId": "user-abc123",
  "expiresAt": 1721095234000
}
```

### TTL

- Default: 100 seconds
- Auto-expires via Redis `EXPIRE` mechanism
- No cleanup needed (Redis handles it)

## API Endpoints

### GET /api/movies

**Response:**
```json
{
  "movies": [
    {
      "id": 1,
      "title": "Inception",
      "description": "Mind-bending thriller",
      "rows_count": 4,
      "cols_count": 6
    }
  ]
}
```

### GET /api/state

**Query Params:**
- `movieId` - Movie ID (integer)
- `userId` - User ID (string)

**Response:**
```json
{
  "movie": {
    "id": 1,
    "title": "Inception",
    "rows_count": 4,
    "cols_count": 6
  },
  "seats": [
    {
      "seat_row": "A",
      "seat_col": 1,
      "seat_label": "A1",
      "status": "available",
      "uiStatus": "available",
      "heldBy": null,
      "isMyHold": false,
      "expiresAt": null
    },
    {
      "seat_row": "A",
      "seat_col": 2,
      "seat_label": "A2",
      "status": "available",
      "uiStatus": "your_hold",
      "heldBy": "user-abc123",
      "isMyHold": true,
      "expiresAt": 1721095234000
    },
    {
      "seat_row": "A",
      "seat_col": 3,
      "seat_label": "A3",
      "status": "confirmed",
      "uiStatus": "confirmed",
      "heldBy": null,
      "isMyHold": false,
      "expiresAt": null
    }
  ]
}
```

### POST /api/hold

**Request:**
```json
{
  "movieId": 1,
  "seatLabel": "A3",
  "userId": "user-abc123"
}
```

**Success Response (200):**
```json
{
  "message": "Seat held",
  "hold": {
    "movieId": 1,
    "seatLabel": "A3",
    "userId": "user-abc123",
    "expiresAt": 1721095234000,
    "ttlSeconds": 100
  }
}
```

**Conflict Response (409):**
```json
{
  "message": "Seat is already on hold",
  "currentHold": {
    "userId": "user-xyz",
    "expiresAt": 1721095200000
  }
}
```

### POST /api/confirm

**Request:**
```json
{
  "movieId": 1,
  "seatLabel": "A3",
  "userId": "user-abc123"
}
```

**Success Response (200):**
```json
{
  "message": "Seat confirmed",
  "movieId": 1,
  "seatLabel": "A3"
}
```

**Conflict Response (409):**
```json
{
  "message": "You do not hold this seat"
}
```

### POST /api/release

**Request:**
```json
{
  "movieId": 1,
  "seatLabel": "A3",
  "userId": "user-abc123"
}
```

**Success Response (200):**
```json
{
  "message": "Seat released",
  "movieId": 1,
  "seatLabel": "A3"
}
```

## Frontend State Management

### User ID Generation

```javascript
function createUserId() {
  return `user-${Math.random().toString(36).slice(2, 10)}`;
}
```

Stored in `localStorage` with key `seatlock-user-id`.

### Polling Mechanism

```javascript
useEffect(() => {
  if (!movieId) return;
  
  async function loadState() {
    const response = await fetch(`${API_BASE}/api/state?movieId=${movieId}&userId=${userId}`);
    const data = await response.json();
    setSeats(data.seats);
  }
  
  loadState();
  const interval = setInterval(loadState, 2000); // Poll every 2s
  
  return () => clearInterval(interval);
}, [movieId, userId]);
```

### Countdown Timer

```javascript
useEffect(() => {
  if (!selectedSeat?.expiresAt) return;
  
  const timer = setInterval(() => {
    setHoldCountdown(Math.max(0, selectedSeat.expiresAt - Date.now()));
  }, 250); // Update every 250ms for smooth countdown
  
  return () => clearInterval(timer);
}, [selectedSeat]);
```

### Auto-Release on Expiry

```javascript
useEffect(() => {
  if (!selectedSeat || holdCountdown > 0) return;
  
  if (selectedSeat.uiStatus === 'your_hold') {
    releaseSeat(selectedSeat);
  }
}, [holdCountdown, selectedSeat]);
```

## Seat Colors

| State        | Color         | Hex       | Meaning                    |
|--------------|---------------|-----------|----------------------------|
| available    | Dark Gray     | #3f3f46   | Click to hold              |
| your_hold    | Amber/Yellow  | #fbbf24   | Your active hold           |
| other_hold   | Orange        | #f97316   | Held by another user       |
| confirmed    | Red           | #ef4444   | Permanently booked         |

## Performance Considerations

### Polling vs Real-time

**Current: Polling (every 2 seconds)**
- ✅ Simple implementation
- ✅ Works with any deployment
- ❌ 2-second lag on updates
- ❌ Unnecessary requests when idle

**Alternative: Server-Sent Events (SSE)**
- ✅ Real-time updates (sub-second)
- ✅ Reduces unnecessary requests
- ❌ More complex server logic
- ❌ Requires persistent connections

**Alternative: WebSockets**
- ✅ Bidirectional real-time
- ✅ Most responsive
- ❌ Most complex
- ❌ Requires WebSocket infrastructure

### Redis Performance

- **Typical latency:** <1ms for GET/SET
- **Throughput:** 100k+ ops/sec on modest hardware
- **Memory:** ~1 KB per hold (100 bytes JSON + overhead)

### PostgreSQL Performance

- **`FOR UPDATE` lock:** Row-level, minimal contention
- **Transaction duration:** <10ms typical
- **Indexes:** Primary key + unique constraints provide fast lookups

## Security Considerations

### Current Implementation

- ✅ Input validation via Zod schemas
- ✅ SQL injection prevention (parameterized queries)
- ✅ CORS enabled (configure allowed origins in production)
- ❌ No authentication (userId is self-declared)
- ❌ No rate limiting
- ❌ No CSRF protection

### Production Hardening

1. **Add authentication:**
   - JWT tokens
   - Session cookies
   - OAuth integration

2. **Rate limiting:**
   ```javascript
   import rateLimit from 'express-rate-limit';
   
   const holdLimiter = rateLimit({
     windowMs: 60 * 1000, // 1 minute
     max: 10, // 10 holds per minute
     message: 'Too many hold requests'
   });
   
   app.post('/api/hold', holdLimiter, ...);
   ```

3. **CORS restrictions:**
   ```javascript
   app.use(cors({
     origin: 'https://your-production-domain.com',
     credentials: true
   }));
   ```

4. **Environment-specific configs:**
   - Use `.env` for secrets
   - Never commit credentials
   - Use connection pooling limits

## Scalability

### Horizontal Scaling

The architecture supports horizontal scaling:

1. **Stateless API servers:**
   - Any server can handle any request
   - Load balance with nginx/HAProxy
   - No server-side sessions

2. **Shared Redis:**
   - Single source of truth for holds
   - Redis Sentinel for HA
   - Redis Cluster for partitioning

3. **PostgreSQL:**
   - Read replicas for `/api/state` queries
   - Primary for writes (`hold`, `confirm`)
   - Connection pooling (PgBouncer)

### Bottlenecks

1. **Polling traffic:**
   - N users × 0.5 req/sec = high QPS
   - Solution: SSE or WebSockets

2. **Redis memory:**
   - 1M concurrent holds ≈ 1 GB RAM
   - Solution: Increase TTL cleanup

3. **Database contention:**
   - High `FOR UPDATE` contention on popular seats
   - Solution: Optimistic locking, retry logic

## Testing Scenarios

### Manual Tests

1. **Basic flow:**
   - Hold → Confirm → See red seat

2. **Expiry:**
   - Hold → Wait 100s → Auto-release

3. **Conflict:**
   - User A holds → User B tries to hold → 409

4. **Concurrent confirm:**
   - User A holds → User B holds different seat → Both confirm → Success

5. **Race condition:**
   - User A holds → User B holds same seat immediately → One succeeds

### Load Testing

```bash
# Install wrk
brew install wrk  # or apt-get install wrk

# Test hold endpoint
wrk -t4 -c100 -d30s -s hold.lua http://localhost:4000/api/hold

# hold.lua
wrk.method = "POST"
wrk.body   = '{"movieId":1,"seatLabel":"A3","userId":"load-test"}'
wrk.headers["Content-Type"] = "application/json"
```

## Future Enhancements

1. **Real-time updates:**
   - Implement SSE or WebSockets
   - Broadcast seat changes to all connected clients

2. **Payment integration:**
   - Add Stripe/PayPal checkout
   - Hold during payment flow

3. **Admin dashboard:**
   - View all bookings
   - Force-release holds
   - Analytics

4. **Multi-showtime support:**
   - Add showtimes to movies
   - Same seat, different times

5. **Seat pricing tiers:**
   - Premium seats (front row, center)
   - Dynamic pricing

6. **Email notifications:**
   - Booking confirmation
   - Reminder before showtime

7. **Mobile app:**
   - React Native version
   - Push notifications for holds expiring

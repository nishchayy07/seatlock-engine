import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigins = [
  "http://localhost:5173",
  process.env.CLIENT_URL, // e.g. https://seatlock-engine.vercel.app
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (curl, Postman, same-origin SSR)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());

// ── Detect real vs mock mode ────────────────────────────────
// We try to connect to PostgreSQL; if it fails we fall back to
// the in-memory mock so the full booking flow still works.
let pool, withTransaction, redis;
let usingMock = false;

async function initDeps() {
  const dbUrl = process.env.DATABASE_URL || "";
  const redisUrl = process.env.REDIS_URL || "";

  if (!dbUrl || !redisUrl) {
    usingMock = true;
  } else {
    try {
      const { pool: realPool, withTransaction: realTx } = await import("./db/pool.js");
      // Quick connectivity test
      await realPool.query("SELECT 1");
      pool = realPool;
      withTransaction = realTx;

      const { redis: realRedis } = await import("./lib/redis.js");
      // Quick ping
      await realRedis.ping();
      redis = realRedis;
    } catch (err) {
      console.warn(`[SeatLock] DB/Redis not reachable (${err.message}). Falling back to mock mode.`);
      usingMock = true;
    }
  }

  if (usingMock) {
    const mock = await import("./lib/mock.js");
    pool = mock.mockPool;
    withTransaction = mock.mockWithTransaction;
    redis = mock.mockRedis;
  }
}

// ── Health ──────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, mode: usingMock ? "mock" : "live", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Booking routes (loaded after deps resolved) ──────────────
app.get("/api/movies", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, title, description, rows_count, cols_count FROM movies ORDER BY id ASC"
    );
    res.json({ movies: rows });
  } catch (e) { next(e); }
});

app.get("/api/state", async (req, res, next) => {
  try {
    const { z } = await import("zod");
    const movieId = z.coerce.number().int().positive().parse(req.query.movieId);
    const userId = z.string().trim().min(1).parse(req.query.userId);
    const { HOLD_TTL_SECONDS, seatHoldKey } = await import("./lib/redis.js").catch(() => ({
      HOLD_TTL_SECONDS: 100,
      seatHoldKey: (m, s) => `seatlock:hold:${m}:${s}`,
    }));

    const movieResult = await pool.query(
      "SELECT id, title, description, rows_count, cols_count FROM movies WHERE id = $1",
      [movieId]
    );
    if (!movieResult.rows[0]) return res.status(404).json({ message: "Movie not found" });

    const seatsResult = await pool.query(
      "SELECT seat_row, seat_col, seat_label, status FROM seats WHERE movie_id = $1 ORDER BY seat_row ASC, seat_col ASC",
      [movieId]
    );

    const seats = await Promise.all(
      seatsResult.rows.map(async (seat) => {
        if (seat.status === "confirmed") {
          return { ...seat, uiStatus: "confirmed", heldBy: null, isMyHold: false, expiresAt: null };
        }
        const key = seatHoldKey(movieId, seat.seat_label);
        const raw = await redis.get(key);
        if (!raw) return { ...seat, uiStatus: "available", heldBy: null, isMyHold: false, expiresAt: null };
        let hold;
        try { hold = JSON.parse(raw); } catch { return { ...seat, uiStatus: "available", heldBy: null, isMyHold: false, expiresAt: null }; }
        return {
          ...seat,
          uiStatus: hold.userId === userId ? "your_hold" : "other_hold",
          heldBy: hold.userId,
          isMyHold: hold.userId === userId,
          expiresAt: hold.expiresAt,
        };
      })
    );

    res.json({ movie: movieResult.rows[0], seats });
  } catch (e) { next(e); }
});

app.post("/api/hold", async (req, res, next) => {
  try {
    const { z } = await import("zod");
    const movieId = z.coerce.number().int().positive().parse(req.body.movieId);
    const seatLabel = z.string().trim().regex(/^[A-Z]\d+$/).parse(req.body.seatLabel.toUpperCase());
    const userId = z.string().trim().min(1).parse(req.body.userId);
    const HOLD_TTL_SECONDS = 100;
    const seatHoldKey = (m, s) => `seatlock:hold:${m}:${s}`;

    const seatResult = await pool.query(
      "SELECT id, status FROM seats WHERE movie_id = $1 AND seat_label = $2",
      [movieId, seatLabel]
    );
    const seat = seatResult.rows[0];
    if (!seat) return res.status(404).json({ message: "Seat not found" });
    if (seat.status === "confirmed") return res.status(409).json({ message: "Seat already confirmed" });

    const expiresAt = Date.now() + HOLD_TTL_SECONDS * 1000;
    const payload = JSON.stringify({ movieId, seatLabel, userId, expiresAt });
    const result = await redis.set(seatHoldKey(movieId, seatLabel), payload, "EX", HOLD_TTL_SECONDS, "NX");

    if (result !== "OK") {
      const raw = await redis.get(seatHoldKey(movieId, seatLabel));
      let currentHold = null;
      try { currentHold = JSON.parse(raw); } catch {}
      return res.status(409).json({ message: "Seat is already on hold", currentHold });
    }

    res.json({ message: "Seat held", hold: { movieId, seatLabel, userId, expiresAt, ttlSeconds: HOLD_TTL_SECONDS } });
  } catch (e) { next(e); }
});

app.post("/api/confirm", async (req, res, next) => {
  try {
    const { z } = await import("zod");
    const movieId = z.coerce.number().int().positive().parse(req.body.movieId);
    const seatLabel = z.string().trim().regex(/^[A-Z]\d+$/).parse(req.body.seatLabel.toUpperCase());
    const userId = z.string().trim().min(1).parse(req.body.userId);
    const seatHoldKey = (m, s) => `seatlock:hold:${m}:${s}`;

    const raw = await redis.get(seatHoldKey(movieId, seatLabel));
    let hold = null;
    try { hold = raw ? JSON.parse(raw) : null; } catch {}
    if (!hold || hold.userId !== userId) return res.status(409).json({ message: "You do not hold this seat" });

    await withTransaction(async (client) => {
      const seatResult = await client.query(
        "SELECT id, status FROM seats WHERE movie_id = $1 AND seat_label = $2 FOR UPDATE",
        [movieId, seatLabel]
      );
      const seat = seatResult.rows[0];
      if (!seat) { const e = new Error("Seat not found"); e.statusCode = 404; throw e; }
      if (seat.status === "confirmed") { const e = new Error("Seat already confirmed"); e.statusCode = 409; throw e; }
      await client.query(
        "UPDATE seats SET status = $3, confirmed_by = $4, confirmed_at = NOW(), updated_at = NOW() WHERE movie_id = $1 AND seat_label = $2",
        [movieId, seatLabel, "confirmed", userId]
      );
    });

    await redis.del(seatHoldKey(movieId, seatLabel));
    res.json({ message: "Seat confirmed", movieId, seatLabel });
  } catch (e) { next(e); }
});

app.post("/api/release", async (req, res, next) => {
  try {
    const { z } = await import("zod");
    const movieId = z.coerce.number().int().positive().parse(req.body.movieId);
    const seatLabel = z.string().trim().regex(/^[A-Z]\d+$/).parse(req.body.seatLabel.toUpperCase());
    const userId = z.string().trim().min(1).parse(req.body.userId);
    const seatHoldKey = (m, s) => `seatlock:hold:${m}:${s}`;

    const raw = await redis.get(seatHoldKey(movieId, seatLabel));
    let hold = null;
    try { hold = raw ? JSON.parse(raw) : null; } catch {}
    if (hold && hold.userId !== userId) return res.status(403).json({ message: "Only the hold owner can release this seat" });

    await redis.del(seatHoldKey(movieId, seatLabel));
    res.json({ message: "Seat released", movieId, seatLabel });
  } catch (e) { next(e); }
});

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) console.error("[Error]", err);
  res.status(status).json({ message });
});

// ── Start ─────────────────────────────────────────────────────
initDeps().then(() => {
  app.listen(port, () => {
    const mode = usingMock ? "🟡 MOCK (in-memory)" : "🟢 LIVE (PostgreSQL + Redis)";
    console.log("╔══════════════════════════════════════╗");
    console.log(`║  SeatLock Engine  →  port ${port}       ║`);
    console.log(`║  Mode: ${mode.padEnd(28)}║`);
    console.log("╚══════════════════════════════════════╝");
  });
});

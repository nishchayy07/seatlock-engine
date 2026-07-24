/**
 * In-memory mock for PostgreSQL + Redis.
 * Used automatically when DATABASE_URL or REDIS_URL is not reachable.
 * Provides identical API surface to the real pool/redis modules.
 */

const ROWS = ["A", "B", "C", "D"];
const COLS = [1, 2, 3, 4, 5, 6];

// Seed movies
const MOVIES = [
  { id: 1, title: "Inception", description: "Mind-bending thriller", rows_count: 4, cols_count: 6 },
  { id: 2, title: "Dune: Part Two", description: "Epic sci-fi desert war", rows_count: 4, cols_count: 6 },
];

// Seat store: { [movieId]: { [seatLabel]: { status, confirmed_by, confirmed_at } } }
const SEATS = {};

function initSeats() {
  for (const movie of MOVIES) {
    SEATS[movie.id] = {};
    for (const row of ROWS) {
      for (const col of COLS) {
        const label = `${row}${col}`;
        SEATS[movie.id][label] = {
          seat_row: row,
          seat_col: col,
          seat_label: label,
          status: "available",
          confirmed_by: null,
          confirmed_at: null,
        };
      }
    }
  }
}

initSeats();

// Redis hold store: { [key]: { value, expiresAt } }
const HOLDS = {};

// ── Mock Pool ───────────────────────────────────────
export const mockPool = {
  async query(sql, params = []) {
    const s = sql.trim().toLowerCase();

    // SELECT movies
    if (s.includes("from movies") && !s.includes("where")) {
      return { rows: MOVIES };
    }

    // SELECT movie by id
    if (s.includes("from movies") && s.includes("where")) {
      const movie = MOVIES.find((m) => m.id === params[0]);
      return { rows: movie ? [movie] : [] };
    }

    // SELECT seats by movie_id
    if (s.includes("from seats") && s.includes("where movie_id")) {
      const movieId = params[0];
      const seats = Object.values(SEATS[movieId] || {});
      seats.sort((a, b) => a.seat_row.localeCompare(b.seat_row) || a.seat_col - b.seat_col);
      return { rows: seats };
    }

    // SELECT single seat
    if (s.includes("from seats") && s.includes("seat_label")) {
      const [movieId, seatLabel] = params;
      const seat = SEATS[movieId]?.[seatLabel];
      if (!seat) return { rows: [] };
      return { rows: [{ id: seatLabel, ...seat }] };
    }

    // UPDATE seats confirmed
    if (s.includes("update seats") && s.includes("confirmed")) {
      const [movieId, seatLabel, , confirmedBy] = params;
      if (SEATS[movieId]?.[seatLabel]) {
        SEATS[movieId][seatLabel].status = "confirmed";
        SEATS[movieId][seatLabel].confirmed_by = confirmedBy;
        SEATS[movieId][seatLabel].confirmed_at = new Date().toISOString();
      }
      return { rows: [] };
    }

    // Health check
    if (s.includes("select 1")) {
      return { rows: [{ ok: 1 }] };
    }

    return { rows: [] };
  },

  connect() {
    const client = {
      query: mockPool.query.bind(mockPool),
      async release() {},
    };
    return Promise.resolve(client);
  },
};

export async function mockWithTransaction(work) {
  const client = await mockPool.connect();
  return work(client);
}

// ── Mock Redis ──────────────────────────────────────
export const mockRedis = {
  async get(key) {
    const entry = HOLDS[key];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete HOLDS[key];
      return null;
    }
    return entry.value;
  },

  async set(key, value, exFlag, ttl, nxFlag) {
    // Simulate SET ... EX ttl NX
    if (nxFlag === "NX") {
      const existing = await this.get(key);
      if (existing !== null) return null; // NX: only set if not exists
    }
    HOLDS[key] = { value, expiresAt: Date.now() + ttl * 1000 };
    return "OK";
  },

  async del(key) {
    delete HOLDS[key];
    return 1;
  },
};

export const IS_MOCK = true;

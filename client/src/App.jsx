import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Toast from "./components/Toast";
import CountdownRing from "./components/CountdownRing";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const HOLD_SECONDS = 100;
const ROWS = ["A", "B", "C", "D"];

/* ── Helpers ─────────────────────────────────── */
function createUserId() {
  return `user-${Math.random().toString(36).slice(2, 10)}`;
}

let toastCounter = 0;
function makeToast(type, message) {
  return { id: ++toastCounter, type, message };
}

/* ── SeatButton ──────────────────────────────── */
function SeatButton({ seat, onClick, disabled, isSelected }) {
  const statusClass = `seat-${seat.uiStatus}`;

  return (
    <button
      id={`seat-${seat.seat_label}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Seat ${seat.seat_label} – ${seat.uiStatus.replace("_", " ")}`}
      className={`seat ${statusClass} ${isSelected ? "ring-2 ring-white/60 ring-offset-1 ring-offset-[#08090d]" : ""} animate-seat-pop`}
    >
      {seat.seat_col}
    </button>
  );
}

/* ── SkeletonGrid ────────────────────────────── */
function SkeletonGrid() {
  return (
    <div className="grid justify-center gap-4">
      {ROWS.map((row) => (
        <div key={row} className="flex items-center gap-3">
          <span className="w-4 text-sm text-slate-600">{row}</span>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((col) => (
              <div
                key={col}
                className="skeleton h-11 w-12 rounded-[10px]"
                style={{ animationDelay: `${(col + ROWS.indexOf(row)) * 50}ms` }}
              />
            ))}
          </div>
          <span className="w-4 text-sm text-slate-600">{row}</span>
        </div>
      ))}
    </div>
  );
}

/* ── MovieCard ───────────────────────────────── */
const MOVIE_ACCENTS = [
  { from: "#7c3aed", to: "#4f46e5", shadow: "rgba(124,58,237,0.3)" },
  { from: "#0e7490", to: "#0284c7", shadow: "rgba(14,116,144,0.3)" },
  { from: "#b45309", to: "#b91c1c", shadow: "rgba(180,83,9,0.3)" },
];

function MovieCard({ movie, isSelected, onClick, index }) {
  const accent = MOVIE_ACCENTS[index % MOVIE_ACCENTS.length];
  const confirmedCount = 0; // we don't have per-movie stats here, placeholder

  return (
    <button
      id={`movie-${movie.id}`}
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200
        ${isSelected
          ? "border-white/15 shadow-glow"
          : "border-white/5 hover:border-white/10 hover:shadow-glow"
        }`}
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${accent.from}22, ${accent.to}15)`
          : "rgba(14,17,23,0.8)",
        boxShadow: isSelected ? `0 0 0 1px ${accent.from}40, 0 4px 32px ${accent.shadow}` : undefined,
      }}
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-0 h-0.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${accent.from}, ${accent.to})`,
          opacity: isSelected ? 1 : 0.3,
          transition: "opacity 0.2s",
        }}
      />

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-white/10">
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )}

      <div className="font-display text-base font-semibold text-slate-100 leading-snug pr-6">
        {movie.title}
      </div>
      {movie.description && (
        <div className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {movie.description}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          {movie.rows_count}×{movie.cols_count}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
          </svg>
          {movie.rows_count * movie.cols_count} seats
        </span>
      </div>
    </button>
  );
}

/* ── InfoRow ─────────────────────────────────── */
function InfoRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">{label}</span>
      <span className={`text-sm font-semibold ${accent || "text-slate-200"}`}>{value}</span>
    </div>
  );
}

/* ── LegendDot ───────────────────────────────── */
function LegendDot({ colorClass, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`h-3 w-3 rounded-sm ${colorClass}`} />
      {label}
    </div>
  );
}

/* ── Stat Pill ───────────────────────────────── */
function StatPill({ count, label, color }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5">
      <span className={`text-lg font-black font-display leading-none ${color}`}>{count}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-600">{label}</span>
    </div>
  );
}

/* ── Main App ────────────────────────────────── */
export default function App() {
  const [userId] = useState(() => {
    const stored = localStorage.getItem("seatlock-user-id");
    if (stored) return stored;
    const next = createUserId();
    localStorage.setItem("seatlock-user-id", next);
    return next;
  });

  const [movies, setMovies] = useState([]);
  const [movieId, setMovieId] = useState("");
  const [movie, setMovie] = useState(null);
  const [seats, setSeats] = useState([]);
  const [seatsLoading, setSeatsLoading] = useState(true);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [holdCountdown, setHoldCountdown] = useState(HOLD_SECONDS * 1000);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const selectedSeatRef = useRef(selectedSeat);
  selectedSeatRef.current = selectedSeat;

  /* Toast helpers */
  const addToast = useCallback((type, message) => {
    setToasts((prev) => [...prev, makeToast(type, message)]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* Load movies once */
  useEffect(() => {
    async function loadMovies() {
      const res = await fetch(`${API_BASE}/api/movies`);
      const data = await res.json();
      setMovies(data.movies || []);
      if (!movieId && data.movies?.length) {
        setMovieId(String(data.movies[0].id));
      }
    }
    loadMovies().catch((err) => addToast("error", err.message));
  }, []);

  /* Poll seat state every 2s */
  useEffect(() => {
    if (!movieId) return;
    let timerId;

    async function loadState(isFirst = false) {
      if (isFirst) setSeatsLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/state?movieId=${movieId}&userId=${encodeURIComponent(userId)}`
        );
        const data = await res.json();
        setMovie(data.movie);
        setSeats(data.seats || []);
        // Keep selectedSeat in sync
        if (selectedSeatRef.current) {
          const updated = data.seats?.find(
            (s) => s.seat_label === selectedSeatRef.current.seat_label
          );
          if (updated) setSelectedSeat((prev) => ({ ...prev, ...updated, expiresAt: prev.expiresAt }));
        }
      } finally {
        if (isFirst) setSeatsLoading(false);
      }
    }

    loadState(true).catch(() => {});
    timerId = setInterval(() => loadState().catch(() => {}), 2000);
    return () => clearInterval(timerId);
  }, [movieId, userId]);

  /* Countdown tick */
  useEffect(() => {
    if (!selectedSeat?.expiresAt) return;
    const timerId = setInterval(() => {
      setHoldCountdown(Math.max(0, selectedSeat.expiresAt - Date.now()));
    }, 250);
    setHoldCountdown(Math.max(0, selectedSeat.expiresAt - Date.now()));
    return () => clearInterval(timerId);
  }, [selectedSeat?.expiresAt]);

  /* Auto-release on expiry */
  useEffect(() => {
    if (!selectedSeat || holdCountdown > 0) return;
    if (selectedSeat.uiStatus === "your_hold") {
      releaseSeat(selectedSeat);
      addToast("info", "Hold expired — seat released.");
    }
  }, [holdCountdown, selectedSeat]);

  /* Derived seat stats */
  const seatStats = useMemo(() => {
    const confirmed = seats.filter((s) => s.uiStatus === "confirmed").length;
    const held = seats.filter((s) => s.uiStatus === "other_hold" || s.uiStatus === "your_hold").length;
    const available = seats.filter((s) => s.uiStatus === "available").length;
    return { confirmed, held, available };
  }, [seats]);

  /* Rows */
  const seatRows = useMemo(
    () => ROWS.map((row) => seats.filter((s) => s.seat_row === row)),
    [seats]
  );

  /* ── Actions ── */
  async function holdSeat(seat) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: Number(movieId), seatLabel: seat.seat_label, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to hold seat");
      setSelectedSeat({ ...seat, uiStatus: "your_hold", expiresAt: data.hold.expiresAt });
      setHoldCountdown(data.hold.ttlSeconds * 1000);
      addToast("success", `Seat ${seat.seat_label} held for 1:40!`);
    } catch (err) {
      addToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmSeat() {
    if (!selectedSeat) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: Number(movieId), seatLabel: selectedSeat.seat_label, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to confirm seat");
      addToast("success", `Seat ${selectedSeat.seat_label} confirmed! Enjoy the show 🎬`);
      setSelectedSeat(null);
      setHoldCountdown(HOLD_SECONDS * 1000);
    } catch (err) {
      addToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function releaseSeat(seat = selectedSeat) {
    if (!seat) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: Number(movieId), seatLabel: seat.seat_label, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to release seat");
      setSelectedSeat(null);
      setHoldCountdown(HOLD_SECONDS * 1000);
    } catch (err) {
      addToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen px-4 py-6 md:px-8 lg:px-12 animate-fade-in">
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="mx-auto max-w-7xl space-y-8">

        {/* ── Header ── */}
        <header className="flex flex-col gap-4 border-b border-white/5 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/20 to-violet-500/20 text-2xl shadow-glow-sky">
              🎬
            </div>
            <div>
              <h1 className="font-display text-2xl font-black gradient-text-sky tracking-tight">
                SeatLock Engine
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Redis holds · PostgreSQL locking · Live polling
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs text-slate-400 font-medium">Live</span>
            </div>
            {/* User ID chip */}
            <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-500 font-mono">
              {userId}
            </div>
          </div>
        </header>

        {/* ── Main Grid ── */}
        <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-6">

            {/* Movie Selector */}
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Select Movie
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {movies.length === 0
                  ? [1, 2].map((i) => (
                      <div key={i} className="skeleton h-28 rounded-2xl" />
                    ))
                  : movies.map((item, i) => (
                      <MovieCard
                        key={item.id}
                        movie={item}
                        index={i}
                        isSelected={String(item.id) === movieId}
                        onClick={() => {
                          setMovieId(String(item.id));
                          setSelectedSeat(null);
                        }}
                      />
                    ))}
              </div>
            </div>

            {/* Seat Grid */}
            <div className="glass-card p-6">
              {/* Seat stats */}
              {seats.length > 0 && (
                <div className="mb-6 grid grid-cols-3 gap-2">
                  <StatPill count={seatStats.available} label="Available" color="text-slate-300" />
                  <StatPill count={seatStats.held} label="Held" color="text-amber-400" />
                  <StatPill count={seatStats.confirmed} label="Confirmed" color="text-red-400" />
                </div>
              )}

              {/* Screen */}
              <div className="screen-arc" />

              {/* Seats */}
              {seatsLoading ? (
                <SkeletonGrid />
              ) : (
                <div className="grid justify-center gap-3">
                  {seatRows.map((rowSeats) => (
                    <div
                      key={rowSeats[0]?.seat_row || Math.random()}
                      className="flex items-center gap-3"
                    >
                      <span className="w-4 text-center text-xs font-semibold text-slate-600">
                        {rowSeats[0]?.seat_row}
                      </span>
                      <div className="grid grid-cols-6 gap-2">
                        {rowSeats.map((seat) => (
                          <SeatButton
                            key={seat.seat_label}
                            seat={seat}
                            isSelected={selectedSeat?.seat_label === seat.seat_label}
                            disabled={loading || seat.uiStatus === "confirmed" || seat.uiStatus === "other_hold"}
                            onClick={() => {
                              if (seat.uiStatus === "available") holdSeat(seat);
                              else if (seat.uiStatus === "your_hold") setSelectedSeat(seat);
                            }}
                          />
                        ))}
                      </div>
                      <span className="w-4 text-center text-xs font-semibold text-slate-600">
                        {rowSeats[0]?.seat_row}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-t border-white/5 pt-5">
                <LegendDot colorClass="bg-[#1e2a3a]" label="Available" />
                <LegendDot colorClass="bg-amber-500" label="Your hold" />
                <LegendDot colorClass="bg-orange-600" label="Other hold" />
                <LegendDot colorClass="bg-red-600" label="Confirmed" />
              </div>
            </div>
          </div>

          {/* ── Checkout Panel ── */}
          <aside className="glass-card flex flex-col p-6">
            <div className="mb-5 flex items-center gap-2">
              <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              <span className="font-display text-base font-bold text-slate-200">Checkout</span>
            </div>

            {selectedSeat ? (
              <div className="flex flex-col gap-4 animate-fade-in">
                <InfoRow label="Seat" value={selectedSeat.seat_label} accent="text-amber-300 font-black text-base" />
                <InfoRow label="Movie" value={movie?.title || "—"} />
                <InfoRow
                  label="Status"
                  value={selectedSeat.uiStatus === "your_hold" ? "On Hold ⏳" : "—"}
                  accent="text-amber-400"
                />

                {/* Countdown Ring */}
                <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-black/30 py-6">
                  <CountdownRing
                    ms={holdCountdown}
                    totalMs={HOLD_SECONDS * 1000}
                    size={128}
                    stroke={7}
                  />
                  <p className="mt-3 text-xs text-slate-600">
                    Hold expires in
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    id="btn-confirm"
                    type="button"
                    onClick={confirmSeat}
                    disabled={loading || selectedSeat.uiStatus !== "your_hold"}
                    className="relative flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 py-3 text-sm font-bold text-white shadow-lg transition-all hover:from-emerald-400 hover:to-emerald-300 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Confirming…
                      </span>
                    ) : "✓ Confirm"}
                  </button>
                  <button
                    id="btn-release"
                    type="button"
                    onClick={() => releaseSeat(selectedSeat)}
                    disabled={loading}
                    className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Release
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/8 p-8 text-center">
                <div className="text-4xl animate-float">🪑</div>
                <div>
                  <p className="text-sm font-medium text-slate-400">No seat selected</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Click an available seat to place a 100-second hold and open checkout.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-white/5 pt-6 text-center text-xs text-slate-600">
          SeatLock Engine · Redis {" "}
          <code className="font-mono text-sky-700">SET ... EX 100 NX</code>
          {" "} · PostgreSQL{" "}
          <code className="font-mono text-sky-700">SELECT ... FOR UPDATE</code>
          {" "} · Polling every 2s
        </footer>
      </div>
    </div>
  );
}

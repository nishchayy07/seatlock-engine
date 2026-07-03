import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const HOLD_SECONDS = 100;
const ROWS = ["A", "B", "C", "D"];
const COLS = [1, 2, 3, 4, 5, 6];

const STATUS_STYLES = {
  available: "bg-zinc-700 text-zinc-200 border-zinc-600",
  your_hold: "bg-amber-400 text-zinc-950 border-amber-300",
  other_hold: "bg-orange-500 text-white border-orange-400",
  confirmed: "bg-red-500 text-white border-red-400",
};

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function createUserId() {
  return `user-${Math.random().toString(36).slice(2, 10)}`;
}

function SeatButton({ seat, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-12 w-12 rounded-lg border text-sm font-semibold transition duration-200 ${STATUS_STYLES[seat.uiStatus]} ${disabled ? "cursor-not-allowed opacity-60" : "hover:scale-[1.03] hover:shadow-lg"}`}
    >
      {seat.seat_col}
    </button>
  );
}

export default function App() {
  const [userId] = useState(() => {
    const existing = localStorage.getItem("seatlock-user-id");
    if (existing) return existing;
    const next = createUserId();
    localStorage.setItem("seatlock-user-id", next);
    return next;
  });
  const [movies, setMovies] = useState([]);
  const [movieId, setMovieId] = useState("");
  const [movie, setMovie] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [holdCountdown, setHoldCountdown] = useState(HOLD_SECONDS * 1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMovies() {
      const response = await fetch(`${API_BASE}/api/movies`);
      const data = await response.json();
      setMovies(data.movies || []);
      if (!movieId && data.movies?.length) {
        setMovieId(String(data.movies[0].id));
      }
    }

    loadMovies().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!movieId) return;

    let intervalId;

    async function loadState() {
      const response = await fetch(
        `${API_BASE}/api/state?movieId=${movieId}&userId=${encodeURIComponent(userId)}`,
      );
      const data = await response.json();
      setMovie(data.movie);
      setSeats(data.seats || []);
      if (selectedSeat) {
        const updatedSeat = data.seats?.find(
          (seat) => seat.seat_label === selectedSeat.seat_label,
        );
        if (updatedSeat) {
          setSelectedSeat(updatedSeat);
        }
      }
    }

    loadState().catch((err) => setError(err.message));
    intervalId = setInterval(() => {
      loadState().catch((err) => setError(err.message));
    }, 2000);

    return () => clearInterval(intervalId);
  }, [movieId, userId]);

  useEffect(() => {
    if (!selectedSeat || !selectedSeat.expiresAt) return;

    const timerId = setInterval(() => {
      setHoldCountdown(Math.max(0, selectedSeat.expiresAt - Date.now()));
    }, 250);

    setHoldCountdown(Math.max(0, selectedSeat.expiresAt - Date.now()));

    return () => clearInterval(timerId);
  }, [selectedSeat]);

  useEffect(() => {
    if (!selectedSeat || holdCountdown > 0) return;
    if (selectedSeat.uiStatus === "your_hold") {
      releaseSeat(selectedSeat);
    }
  }, [holdCountdown, selectedSeat]);

  const seatRows = useMemo(
    () => ROWS.map((row) => seats.filter((seat) => seat.seat_row === row)),
    [seats],
  );

  async function holdSeat(seat) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId: Number(movieId),
          seatLabel: seat.seat_label,
          userId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to hold seat");
      }

      setSelectedSeat({
        ...seat,
        uiStatus: "your_hold",
        expiresAt: data.hold.expiresAt,
      });
      setHoldCountdown(data.hold.ttlSeconds * 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmSeat() {
    if (!selectedSeat) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId: Number(movieId),
          seatLabel: selectedSeat.seat_label,
          userId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to confirm seat");
      }

      setSelectedSeat(null);
      setHoldCountdown(HOLD_SECONDS * 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function releaseSeat(seat = selectedSeat) {
    if (!seat) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId: Number(movieId),
          seatLabel: seat.seat_label,
          userId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to release seat");
      }

      setSelectedSeat(null);
      setHoldCountdown(HOLD_SECONDS * 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full px-4 py-6 text-zinc-100 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-100">
              SeatLock Engine
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Cinema booking with Redis holds and PostgreSQL locking
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-400">
            user: {userId}
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {movies.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMovieId(String(item.id))}
                  className={`rounded-2xl border p-5 text-left transition ${String(item.id) === movieId ? "border-sky-400 bg-sky-400/10 shadow-glow" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"}`}
                >
                  <div className="text-lg font-bold text-zinc-100">
                    {item.title}
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {item.rows_count} rows x {item.cols_count} seats
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow">
              <div className="mb-5 text-center text-xs uppercase tracking-[0.35em] text-zinc-500">
                Screen
              </div>
              <div className="mx-auto mb-6 h-px max-w-2xl bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />

              <div className="grid justify-center gap-4">
                {seatRows.map((rowSeats) => (
                  <div
                    key={rowSeats[0]?.seat_row || Math.random()}
                    className="flex items-center gap-3"
                  >
                    <span className="w-4 text-sm text-zinc-400">
                      {rowSeats[0]?.seat_row}
                    </span>
                    <div className="grid grid-cols-6 gap-2">
                      {rowSeats.map((seat) => (
                        <SeatButton
                          key={seat.seat_label}
                          seat={seat}
                          disabled={loading || seat.uiStatus === "confirmed"}
                          onClick={() => {
                            if (seat.uiStatus === "available") {
                              holdSeat(seat);
                            } else if (seat.uiStatus === "your_hold") {
                              setSelectedSeat(seat);
                            }
                          }}
                        />
                      ))}
                    </div>
                    <span className="w-4 text-right text-sm text-zinc-400">
                      {rowSeats[0]?.seat_row}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-300">
                <LegendSwatch className="bg-zinc-700" label="Available" />
                <LegendSwatch className="bg-amber-400" label="Your hold" />
                <LegendSwatch className="bg-orange-500" label="Other hold" />
                <LegendSwatch className="bg-red-500" label="Confirmed" />
              </div>

              {error ? (
                <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-[#161616] p-6 shadow-glow">
            <div className="mb-5 text-xl font-bold text-sky-300">Checkout</div>

            {selectedSeat ? (
              <div className="space-y-4">
                <InfoRow label="Seat" value={selectedSeat.seat_label} />
                <InfoRow label="Movie" value={movie?.title || "—"} />
                <InfoRow
                  label="Session"
                  value={
                    movieId
                      ? `c${String(movieId).padStart(2, "0")}dcfaf...`
                      : "—"
                  }
                />

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-center">
                  <div className="text-4xl font-black tracking-[0.2em] text-amber-400">
                    {formatCountdown(holdCountdown)}
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
                    Hold expires in
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={confirmSeat}
                    disabled={loading || selectedSeat.uiStatus !== "your_hold"}
                    className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => releaseSeat(selectedSeat)}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Release
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
                Click an available seat to place a temporary hold and open
                checkout.
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${className}`} />
      <span>{label}</span>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-100">{value}</span>
    </div>
  );
}

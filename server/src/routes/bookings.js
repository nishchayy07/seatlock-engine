import { Router } from "express";
import { z } from "zod";
import { pool, withTransaction } from "../db/pool.js";
import { redis, HOLD_TTL_SECONDS, seatHoldKey } from "../lib/redis.js";

const router = Router();

const movieIdSchema = z.coerce.number().int().positive();
const seatLabelSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]\d+$/);
const userIdSchema = z.string().trim().min(1);

function normalizeSeatLabel(value) {
  return value.toUpperCase();
}

async function getHold(movieId, seatLabel) {
  const raw = await redis.get(seatHoldKey(movieId, seatLabel));
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

router.get("/movies", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, title, description, rows_count, cols_count FROM movies ORDER BY id ASC",
    );

    res.json({ movies: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/state", async (req, res, next) => {
  try {
    const movieId = movieIdSchema.parse(req.query.movieId);
    const userId = userIdSchema.parse(req.query.userId);

    const movieResult = await pool.query(
      "SELECT id, title, description, rows_count, cols_count FROM movies WHERE id = $1",
      [movieId],
    );

    if (!movieResult.rows[0]) {
      return res.status(404).json({ message: "Movie not found" });
    }

    const seatsResult = await pool.query(
      "SELECT seat_row, seat_col, seat_label, status FROM seats WHERE movie_id = $1 ORDER BY seat_row ASC, seat_col ASC",
      [movieId],
    );

    const seats = await Promise.all(
      seatsResult.rows.map(async (seat) => {
        if (seat.status === "confirmed") {
          return {
            ...seat,
            uiStatus: "confirmed",
            heldBy: null,
            isMyHold: false,
            expiresAt: null,
          };
        }

        const hold = await getHold(movieId, seat.seat_label);

        if (!hold) {
          return {
            ...seat,
            uiStatus: "available",
            heldBy: null,
            isMyHold: false,
            expiresAt: null,
          };
        }

        return {
          ...seat,
          uiStatus: hold.userId === userId ? "your_hold" : "other_hold",
          heldBy: hold.userId,
          isMyHold: hold.userId === userId,
          expiresAt: hold.expiresAt,
        };
      }),
    );

    res.json({ movie: movieResult.rows[0], seats });
  } catch (error) {
    next(error);
  }
});

router.post("/hold", async (req, res, next) => {
  try {
    const movieId = movieIdSchema.parse(req.body.movieId);
    const seatLabel = normalizeSeatLabel(
      seatLabelSchema.parse(req.body.seatLabel),
    );
    const userId = userIdSchema.parse(req.body.userId);

    const seatResult = await pool.query(
      "SELECT id, status FROM seats WHERE movie_id = $1 AND seat_label = $2",
      [movieId, seatLabel],
    );

    const seat = seatResult.rows[0];
    if (!seat) {
      return res.status(404).json({ message: "Seat not found" });
    }

    if (seat.status === "confirmed") {
      return res.status(409).json({ message: "Seat already confirmed" });
    }

    const expiresAt = Date.now() + HOLD_TTL_SECONDS * 1000;
    const payload = JSON.stringify({ movieId, seatLabel, userId, expiresAt });

    const result = await redis.set(
      seatHoldKey(movieId, seatLabel),
      payload,
      "EX",
      HOLD_TTL_SECONDS,
      "NX",
    );
    if (result !== "OK") {
      const currentHold = await getHold(movieId, seatLabel);
      return res.status(409).json({
        message: "Seat is already on hold",
        currentHold,
      });
    }

    res.json({
      message: "Seat held",
      hold: {
        movieId,
        seatLabel,
        userId,
        expiresAt,
        ttlSeconds: HOLD_TTL_SECONDS,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/confirm", async (req, res, next) => {
  try {
    const movieId = movieIdSchema.parse(req.body.movieId);
    const seatLabel = normalizeSeatLabel(
      seatLabelSchema.parse(req.body.seatLabel),
    );
    const userId = userIdSchema.parse(req.body.userId);

    const hold = await getHold(movieId, seatLabel);
    if (!hold || hold.userId !== userId) {
      return res.status(409).json({ message: "You do not hold this seat" });
    }

    await withTransaction(async (client) => {
      const seatResult = await client.query(
        "SELECT id, status FROM seats WHERE movie_id = $1 AND seat_label = $2 FOR UPDATE",
        [movieId, seatLabel],
      );

      const seat = seatResult.rows[0];
      if (!seat) {
        const error = new Error("Seat not found");
        error.statusCode = 404;
        throw error;
      }

      if (seat.status === "confirmed") {
        const error = new Error("Seat already confirmed");
        error.statusCode = 409;
        throw error;
      }

      await client.query(
        "UPDATE seats SET status = $3, confirmed_by = $4, confirmed_at = NOW(), updated_at = NOW() WHERE movie_id = $1 AND seat_label = $2",
        [movieId, seatLabel, "confirmed", userId],
      );
    });

    await redis.del(seatHoldKey(movieId, seatLabel));

    res.json({ message: "Seat confirmed", movieId, seatLabel });
  } catch (error) {
    next(error);
  }
});

router.post("/release", async (req, res, next) => {
  try {
    const movieId = movieIdSchema.parse(req.body.movieId);
    const seatLabel = normalizeSeatLabel(
      seatLabelSchema.parse(req.body.seatLabel),
    );
    const userId = userIdSchema.parse(req.body.userId);

    const hold = await getHold(movieId, seatLabel);
    if (hold && hold.userId !== userId) {
      return res
        .status(403)
        .json({ message: "Only the hold owner can release this seat" });
    }

    await redis.del(seatHoldKey(movieId, seatLabel));

    res.json({ message: "Seat released", movieId, seatLabel });
  } catch (error) {
    next(error);
  }
});

export { router as bookingsRouter };
export default router;

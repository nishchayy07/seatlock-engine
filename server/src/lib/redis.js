import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL);

export const HOLD_TTL_SECONDS = 100;

export function seatHoldKey(movieId, seatLabel) {
  return `seatlock:hold:${movieId}:${seatLabel}`;
}

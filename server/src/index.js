import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db/pool.js";
import bookingRouter from "./routes/bookings.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const result = await pool.query("SELECT 1 AS ok");
  res.json({ ok: result.rows[0].ok === 1 });
});

app.use("/api", bookingRouter);

app.listen(port, () => {
  console.log(`SeatLock Engine API running on http://localhost:${port}`);
});

import "dotenv/config";
import { pool } from "./db/pool.js";

async function main() {
  await pool.query(
    "INSERT INTO movies (title, description, rows_count, cols_count) VALUES ('Inception', 'Mind-bending thriller', 4, 6), ('Dune: Part Two', 'Epic sci-fi desert war', 4, 6) ON CONFLICT (title) DO NOTHING",
  );

  await pool.query(`
    WITH seat_matrix AS (
      SELECT * FROM (VALUES
        ('A', 1), ('A', 2), ('A', 3), ('A', 4), ('A', 5), ('A', 6),
        ('B', 1), ('B', 2), ('B', 3), ('B', 4), ('B', 5), ('B', 6),
        ('C', 1), ('C', 2), ('C', 3), ('C', 4), ('C', 5), ('C', 6),
        ('D', 1), ('D', 2), ('D', 3), ('D', 4), ('D', 5), ('D', 6)
      ) AS grid(seat_row, seat_col)
    )
    INSERT INTO seats (movie_id, seat_row, seat_col, seat_label)
    SELECT m.id, grid.seat_row, grid.seat_col, grid.seat_row || grid.seat_col::TEXT
    FROM movies m
    CROSS JOIN seat_matrix grid
    ON CONFLICT (movie_id, seat_label) DO NOTHING
  `);

  console.log("Seed complete");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});

CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT,
  rows_count INT NOT NULL DEFAULT 4,
  cols_count INT NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seats (
  id SERIAL PRIMARY KEY,
  movie_id INT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  seat_row CHAR(1) NOT NULL,
  seat_col INT NOT NULL,
  seat_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'confirmed')),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seats_movie_label_unique UNIQUE (movie_id, seat_label),
  CONSTRAINT seats_movie_position_unique UNIQUE (movie_id, seat_row, seat_col)
);
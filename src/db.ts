import { Pool, PoolClient } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// A seat is booked iff seats.booking_id is set. FK + UNIQUE constraints are the last line of defence.
export const migrate = () =>
  pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      venue TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users,
      event_id INT NOT NULL REFERENCES events,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      total INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, idempotency_key));
    CREATE TABLE IF NOT EXISTS seats (
      id SERIAL PRIMARY KEY,
      event_id INT NOT NULL REFERENCES events ON DELETE CASCADE,
      label TEXT NOT NULL,
      price INT NOT NULL,
      booking_id INT REFERENCES bookings,
      UNIQUE (event_id, label));
    CREATE INDEX IF NOT EXISTS seats_booking_idx ON seats (booking_id);
  `);

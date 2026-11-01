import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { config } from './config';
import { pool, tx } from './db';
import { emailQueue } from './queue';
import { holdOwners, holdSeats, redis, releaseHolds } from './redis';

type AuthUser = { id: number; role: string; email: string };
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- validation ----------
const posInt = z.coerce.number().int().positive();
const credentials = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(8) });
const seatsBody = z.object({ seatIds: z.array(posInt).min(1).max(10).transform((a) => [...new Set(a)]) });
const eventBody = z.object({
  name: z.string().min(1),
  venue: z.string().min(1),
  startsAt: z.coerce.date(),
  rows: z.number().int().min(1).max(26),
  seatsPerRow: z.number().int().min(1).max(100),
  price: z.number().int().positive(),
});

// ---------- middleware ----------
const rateLimit: RequestHandler = async (req, _res, next) => {
  const key = `rl:${req.ip}:${Math.floor(Date.now() / 60_000)}`; // fixed one-minute window
  const [[, count]] = (await redis.multi().incr(key).expire(key, 60).exec())! as [[null, number], unknown];
  if (count > config.rateLimitPerMin) throw new HttpError(429, 'Too many requests');
  next();
};

const auth = (role?: 'admin'): RequestHandler => (req, _res, next) => {
  try {
    req.user = jwt.verify((req.header('Authorization') ?? '').replace('Bearer ', ''), config.jwtSecret) as AuthUser;
  } catch {
    throw new HttpError(401, 'Invalid or missing token');
  }
  if (role && req.user.role !== role) throw new HttpError(403, 'Forbidden');
  next();
};

const sign = (u: AuthUser) => jwt.sign({ id: u.id, role: u.role, email: u.email }, config.jwtSecret, { expiresIn: '1d' });

const BOOKING_SQL = `
  SELECT b.id, b.event_id, b.status, b.total, b.created_at,
         coalesce(array_agg(s.label ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '{}') AS seats
  FROM bookings b LEFT JOIN seats s ON s.booking_id = b.id`;
const getBooking = async (id: number) => (await pool.query(`${BOOKING_SQL} WHERE b.id = $1 GROUP BY b.id`, [id])).rows[0];

// ---------- routes ----------
export const app = express();
app.use(express.json(), rateLimit);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/register', async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const role = email === config.adminEmail ? 'admin' : 'user';
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
    [email, await bcrypt.hash(password, config.bcryptRounds), role],
  );
  res.status(201).json({ token: sign(rows[0]) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Invalid credentials');
  res.json({ token: sign(user) });
});

app.post('/events', auth('admin'), async (req, res) => {
  const b = eventBody.parse(req.body);
  const event = await tx(async (c) => {
    const { rows } = await c.query('INSERT INTO events (name, venue, starts_at) VALUES ($1, $2, $3) RETURNING *', [b.name, b.venue, b.startsAt]);
    await c.query(
      `INSERT INTO seats (event_id, label, price)
       SELECT $1::int, chr(64 + r) || s::text, $4::int FROM generate_series(1, $2::int) r, generate_series(1, $3::int) s`,
      [rows[0].id, b.rows, b.seatsPerRow, b.price],
    );
    return rows[0];
  });
  res.status(201).json({ ...event, seats: b.rows * b.seatsPerRow });
});

app.get('/events', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, count(s.id) FILTER (WHERE s.booking_id IS NULL)::int AS available
     FROM events e LEFT JOIN seats s ON s.event_id = e.id GROUP BY e.id ORDER BY e.starts_at LIMIT 100`,
  );
  res.json(rows);
});

app.get('/events/:id/seats', async (req, res) => {
  const eventId = posInt.parse(req.params.id);
  const { rows } = await pool.query('SELECT id, label, price, booking_id IS NOT NULL AS booked FROM seats WHERE event_id = $1 ORDER BY id', [eventId]);
  const holds = rows.length ? await holdOwners(eventId, rows.map((s) => s.id)) : [];
  res.json(rows.map((s, i) => ({ id: s.id, label: s.label, price: s.price, status: s.booked ? 'BOOKED' : holds[i] ? 'HELD' : 'AVAILABLE' })));
});

// Soft reservation (Redis, TTL). The database remains the source of truth at booking time.
app.post('/events/:id/holds', auth(), async (req, res) => {
  const eventId = posInt.parse(req.params.id);
  const { seatIds } = seatsBody.parse(req.body);
  const free = await pool.query('SELECT count(*)::int AS n FROM seats WHERE event_id = $1 AND id = ANY($2) AND booking_id IS NULL', [eventId, seatIds]);
  if (free.rows[0].n !== seatIds.length || !(await holdSeats(eventId, seatIds, req.user!.id))) throw new HttpError(409, 'Seat(s) unavailable');
  res.status(201).json({ seatIds, expiresInSeconds: config.holdTtl });
});

app.post('/events/:id/bookings', auth(), async (req, res) => {
  const eventId = posInt.parse(req.params.id);
  const key = req.header('Idempotency-Key');
  if (!key) throw new HttpError(400, 'Idempotency-Key header is required');
  const { seatIds } = seatsBody.parse(req.body);
  const user = req.user!;

  if ((await holdOwners(eventId, seatIds)).some((owner) => owner && owner !== String(user.id)))
    throw new HttpError(409, 'Seat(s) held by another user');

  const { bookingId, replayed } = await tx(async (c) => {
    // Idempotency: the UNIQUE (user_id, key) insert blocks a concurrent twin until we commit, then it replays.
    const ins = await c.query(
      `INSERT INTO bookings (user_id, event_id, idempotency_key) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`,
      [user.id, eventId, key],
    );
    if (!ins.rowCount) {
      const old = await c.query('SELECT id FROM bookings WHERE user_id = $1 AND idempotency_key = $2', [user.id, key]);
      return { bookingId: old.rows[0].id as number, replayed: true };
    }
    const newId: number = ins.rows[0].id;
    // Lock in id order (no deadlocks). A seat booked while we waited fails the recheck and drops out of the result.
    const seats = await c.query('SELECT id, price FROM seats WHERE event_id = $1 AND id = ANY($2) AND booking_id IS NULL ORDER BY id FOR UPDATE', [eventId, seatIds]);
    if (seats.rowCount !== seatIds.length) throw new HttpError(409, 'Seat(s) unavailable'); // rolls back the booking row too
    await c.query('UPDATE seats SET booking_id = $1 WHERE id = ANY($2)', [newId, seatIds]);
    await c.query('UPDATE bookings SET total = $2 WHERE id = $1', [newId, seats.rows.reduce((sum, s) => sum + s.price, 0)]);
    return { bookingId: newId, replayed: false };
  });

  if (!replayed) {
    // Post-commit side effects must never fail the request: the booking already exists.
    await Promise.all([
      releaseHolds(eventId, seatIds),
      emailQueue.add('confirmation', { to: user.email, subject: `Booking #${bookingId} confirmed`, text: `Your seats are confirmed (booking #${bookingId}).` }),
    ]).catch(console.error);
  }
  res.status(replayed ? 200 : 201).json(await getBooking(bookingId));
});

app.get('/bookings/mine', auth(), async (req, res) => {
  res.json((await pool.query(`${BOOKING_SQL} WHERE b.user_id = $1 GROUP BY b.id ORDER BY b.id DESC`, [req.user!.id])).rows);
});

app.delete('/bookings/:id', auth(), async (req, res) => {
  const id = posInt.parse(req.params.id);
  const cancelled = await tx(async (c) => {
    const r = await c.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1 AND user_id = $2 AND status = 'CONFIRMED'`, [id, req.user!.id]);
    if (r.rowCount) await c.query('UPDATE seats SET booking_id = NULL WHERE booking_id = $1', [id]);
    return !!r.rowCount;
  });
  if (!cancelled) throw new HttpError(404, 'Active booking not found');
  res.status(204).end();
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return void res.status(400).json({ error: err.issues });
  const [status, message] =
    err instanceof HttpError ? [err.status, err.message]
    : err.code === '23505' ? [409, 'Already exists']
    : err.code === '23503' ? [404, 'Not found']
    : [500, 'Internal error'];
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
});

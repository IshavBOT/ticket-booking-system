import request from 'supertest';
import { app } from '../src/app';
import { migrate, pool } from '../src/db';
import { emailQueue } from '../src/queue';
import { redis } from '../src/redis';

const server = app.listen(0); // one real server for the whole suite
const api = request(server);
const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

async function newUser(email = `u${uid()}@test.com`) {
  const res = await api.post('/auth/register').send({ email, password: 'password123' });
  return res.status === 201 ? res.body.token : (await api.post('/auth/login').send({ email, password: 'password123' })).body.token;
}

async function newEvent(rows = 2, seatsPerRow = 5) {
  const admin = await newUser('admin@test.com');
  const ev = await api.post('/events').set('Authorization', `Bearer ${admin}`)
    .send({ name: 'Concert', venue: 'Arena', startsAt: '2030-01-01T18:00:00Z', rows, seatsPerRow, price: 500 });
  const seats = await api.get(`/events/${ev.body.id}/seats`);
  return { eventId: ev.body.id as number, seatIds: seats.body.map((s: { id: number }) => s.id) as number[] };
}

const book = (token: string, eventId: number, seatIds: number[], key = uid()) =>
  api.post(`/events/${eventId}/bookings`).set({ Authorization: `Bearer ${token}`, 'Idempotency-Key': key }).send({ seatIds });
const hold = (token: string, eventId: number, seatIds: number[]) =>
  api.post(`/events/${eventId}/holds`).set('Authorization', `Bearer ${token}`).send({ seatIds });

beforeAll(migrate);
afterAll(async () => {
  server.close();
  await Promise.all([pool.end(), emailQueue.close()]);
  await redis.quit();
});

test('only admins can create events', async () => {
  const user = await newUser();
  const res = await api.post('/events').set('Authorization', `Bearer ${user}`).send({});
  expect(res.status).toBe(403);
});

test('50 users racing for the same seat: exactly one wins, no double booking', async () => {
  const { eventId, seatIds } = await newEvent();
  const tokens = await Promise.all(Array.from({ length: 50 }, () => newUser()));

  const results = await Promise.all(tokens.map((t) => book(t, eventId, [seatIds[0]])));

  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(49);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM seats WHERE id = $1 AND booking_id IS NOT NULL', [seatIds[0]]);
  expect(rows[0].n).toBe(1);
});

test('overlapping multi-seat bookings in opposite order do not deadlock or oversell', async () => {
  const { eventId, seatIds } = await newEvent();
  const [a, b] = await Promise.all([newUser(), newUser()]);
  const [ra, rb] = await Promise.all([book(a, eventId, [seatIds[0], seatIds[1]]), book(b, eventId, [seatIds[1], seatIds[0]])]);
  expect([ra.status, rb.status].sort()).toEqual([201, 409]);
});

test('a hold blocks other users until the holder books', async () => {
  const { eventId, seatIds } = await newEvent();
  const [a, b] = await Promise.all([newUser(), newUser()]);

  expect((await hold(a, eventId, [seatIds[0]])).status).toBe(201);
  expect((await hold(b, eventId, [seatIds[0]])).status).toBe(409);
  expect((await book(b, eventId, [seatIds[0]])).status).toBe(409);
  expect((await api.get(`/events/${eventId}/seats`)).body[0].status).toBe('HELD');

  expect((await book(a, eventId, [seatIds[0]])).status).toBe(201);
  expect((await api.get(`/events/${eventId}/seats`)).body[0].status).toBe('BOOKED');
});

test('concurrent holds on the same seat: exactly one succeeds', async () => {
  const { eventId, seatIds } = await newEvent();
  const tokens = await Promise.all(Array.from({ length: 20 }, () => newUser()));
  const results = await Promise.all(tokens.map((t) => hold(t, eventId, [seatIds[0]])));
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
});

test('retrying with the same Idempotency-Key returns the same booking', async () => {
  const { eventId, seatIds } = await newEvent();
  const token = await newUser();
  const key = uid();

  const results = await Promise.all(Array.from({ length: 5 }, () => book(token, eventId, [seatIds[0]], key)));

  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
  expect((await book(token, eventId, [seatIds[0]], key)).status).toBe(200);
});

test('booking without an Idempotency-Key is rejected', async () => {
  const { eventId, seatIds } = await newEvent();
  const res = await api.post(`/events/${eventId}/bookings`).set('Authorization', `Bearer ${await newUser()}`).send({ seatIds: [seatIds[0]] });
  expect(res.status).toBe(400);
});

test('cancelling releases the seats and only the owner can cancel', async () => {
  const { eventId, seatIds } = await newEvent();
  const [owner, other] = await Promise.all([newUser(), newUser()]);
  const booking = await book(owner, eventId, [seatIds[0], seatIds[1]]);
  expect(booking.body).toMatchObject({ status: 'CONFIRMED', total: 1000, seats: ['A1', 'A2'] });

  expect((await api.delete(`/bookings/${booking.body.id}`).set('Authorization', `Bearer ${other}`)).status).toBe(404);
  expect((await api.delete(`/bookings/${booking.body.id}`).set('Authorization', `Bearer ${owner}`)).status).toBe(204);
  expect((await book(other, eventId, [seatIds[0]])).status).toBe(201);
});

test('confirmation email is queued after a successful booking', async () => {
  const { eventId, seatIds } = await newEvent();
  const spy = jest.spyOn(emailQueue, 'add');
  try {
    await book(await newUser(), eventId, [seatIds[0]]);
    expect(spy).toHaveBeenCalledWith(
      'confirmation',
      expect.objectContaining({ subject: expect.stringContaining('confirmed') }),
    );
  } finally {
    spy.mockRestore();
  }
});

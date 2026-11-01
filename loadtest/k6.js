// Run: k6 run loadtest/k6.js   (start the API with RATE_LIMIT_PER_MIN=1000000 first)
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const PASSWORD = 'password123';

http.setResponseCallback(http.expectedStatuses(200, 201, 409)); // 409 = seat already taken, an expected outcome

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 200 },
    { duration: '10s', target: 0 },
  ],
  // Latency depends on your hardware: read p(95) for {name:book} and {name:seatmap} from the summary instead of gating on it.
  thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'] },
};

const post = (path, body, { token, headers, name } = {}) =>
  http.post(`${BASE}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    tags: { name: name || path },
  });

const tokenFor = (email) => {
  const res = post('/auth/register', { email, password: PASSWORD });
  return (res.status === 201 ? res : post('/auth/login', { email, password: PASSWORD })).json('token');
};

export function setup() {
  const admin = tokenFor(__ENV.ADMIN_EMAIL || 'admin@example.com');
  const event = post('/events', { name: 'Load test', venue: 'Arena', startsAt: '2030-01-01T18:00:00Z', rows: 26, seatsPerRow: 100, price: 500 }, { token: admin }).json();
  const seatIds = http.get(`${BASE}/events/${event.id}/seats`).json().map((s) => s.id);
  const run = Date.now();
  return { eventId: event.id, seatIds, tokens: Array.from({ length: 50 }, (_, i) => tokenFor(`load${run}-${i}@test.com`)) };
}

export default function (data) {
  const token = data.tokens[__VU % data.tokens.length];
  const seat = data.seatIds[Math.floor(Math.random() * data.seatIds.length)];
  const booking = post(`/events/${data.eventId}/bookings`, { seatIds: [seat] }, { token, name: 'book', headers: { 'Idempotency-Key': `${__VU}-${__ITER}-${Date.now()}` } });
  check(booking, { 'booked or already taken': (r) => r.status === 201 || r.status === 409 });
  if (__ITER % 5 === 0) { // browsing is more common than booking, but the full seat map is heavy; sample it
    check(http.get(`${BASE}/events/${data.eventId}/seats`, { tags: { name: 'seatmap' } }), { 'seat map ok': (r) => r.status === 200 });
  }
}


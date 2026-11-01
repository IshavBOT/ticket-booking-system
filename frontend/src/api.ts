const BASE = import.meta.env.VITE_API_URL ?? '/api'
const TOKEN_KEY = 'token'

export type User = { id: number; role: string; email: string }
export type Event = { id: number; name: string; venue: string; starts_at: string; available: number }
export type Seat = { id: number; label: string; price: number; status: 'AVAILABLE' | 'HELD' | 'BOOKED' }
export type Booking = {
  id: number
  event_id: number
  status: string
  total: number
  created_at: string
  seats: string[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getUser(): User | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as User
  } catch {
    return null
  }
}

function formatError(status: number, body: unknown): string {
  if (status === 429) return 'Too many requests. Try again shortly.'
  const err = (body as { error?: unknown } | null)?.error
  if (typeof err === 'string') return err
  if (Array.isArray(err)) {
    return err.map((e: { message?: string }) => e.message).filter(Boolean).join(', ') || 'Validation error'
  }
  return 'Request failed'
}

async function request<T>(path: string, init: RequestInit = {}, extra?: { idempotencyKey?: string }): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (extra?.idempotencyKey) headers.set('Idempotency-Key', extra.idempotencyKey)

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 401) {
    clearToken()
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
    throw new ApiError(401, 'Please log in')
  }
  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, formatError(res.status, body))
  return body as T
}

export const api = {
  register: (email: string, password: string) =>
    request<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  events: () => request<Event[]>('/events'),
  seats: (eventId: number) => request<Seat[]>(`/events/${eventId}/seats`),
  hold: (eventId: number, seatIds: number[]) =>
    request<{ seatIds: number[]; expiresInSeconds: number }>(`/events/${eventId}/holds`, {
      method: 'POST',
      body: JSON.stringify({ seatIds }),
    }),
  book: (eventId: number, seatIds: number[], idempotencyKey: string) =>
    request<Booking>(
      `/events/${eventId}/bookings`,
      { method: 'POST', body: JSON.stringify({ seatIds }) },
      { idempotencyKey },
    ),
  myBookings: () => request<Booking[]>('/bookings/mine'),
  cancelBooking: (id: number) => request<void>(`/bookings/${id}`, { method: 'DELETE' }),
  createEvent: (body: { name: string; venue: string; startsAt: string; rows: number; seatsPerRow: number; price: number }) =>
    request('/events', { method: 'POST', body: JSON.stringify(body) }),
}

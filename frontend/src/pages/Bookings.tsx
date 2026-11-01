import { useEffect, useState } from 'react'
import { api, type Booking } from '../api'
import { ErrorBox } from '../auth'

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)

  async function load() {
    setBookings(await api.myBookings())
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load bookings'))
  }, [])

  async function cancel(id: number) {
    setError(null)
    setPendingId(id)
    try {
      await api.cancelBooking(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <h1 className="shrink-0 font-serif text-xl tracking-wide">My bookings</h1>
      <ErrorBox message={error} />
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-hidden sm:grid-cols-3">
        {bookings.map((b) => (
          <div key={b.id} className="rounded-xl border border-white/10 bg-[#1c1418] p-4">
            <div className="font-serif">
              Booking #{b.id} · {b.status}
            </div>
            <div className="text-xs text-stone-400">Seats: {b.seats.join(', ') || '—'}</div>
            <div className="text-xs text-stone-400">Total: {b.total}</div>
            {b.status === 'CONFIRMED' && (
              <button
                className="mt-2 rounded-full border border-white/15 px-3 py-1 text-xs disabled:opacity-50"
                disabled={pendingId === b.id}
                onClick={() => cancel(b.id)}
              >
                {pendingId === b.id ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </div>
        ))}
      </div>
      {!error && bookings.length === 0 && <p className="text-sm text-stone-500">No bookings yet.</p>}
    </div>
  )
}

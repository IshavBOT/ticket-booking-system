import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, api, type Booking, type Seat } from '../api'
import { ErrorBox } from '../auth'

const conflict = 'Someone else got there first'

function seatClass(seat: Seat, selected: boolean, mine: boolean) {
  if (seat.status === 'BOOKED') return 'cursor-not-allowed bg-stone-600 text-stone-300'
  if (mine) return 'bg-sky-500 text-white'
  if (selected) return 'bg-amber-300 text-stone-900 ring-1 ring-amber-100'
  if (seat.status === 'HELD') return 'cursor-not-allowed bg-yellow-400 text-stone-900'
  return 'bg-emerald-500 text-white hover:bg-emerald-400'
}

export default function EventSeats() {
  const { id } = useParams()
  const eventId = Number(id)
  const [seats, setSeats] = useState<Seat[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [held, setHeld] = useState<number[]>([])
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [holding, setHolding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const idempotencyKey = useRef<string | null>(null)

  const loadSeats = useCallback(async () => {
    const data = await api.seats(eventId)
    setSeats(data)
  }, [eventId])

  useEffect(() => {
    loadSeats().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load seats'))
    const poll = setInterval(() => {
      loadSeats().catch(() => {})
    }, 5000)
    return () => clearInterval(poll)
  }, [loadSeats])

  const holdActive = remaining > 0
  useEffect(() => {
    if (!holdActive) return
    const t = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          setHeld([])
          setSelected([])
          idempotencyKey.current = null
          loadSeats().catch(() => {})
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [holdActive, loadSeats])

  const rows = useMemo(() => {
    const map = new Map<string, Seat[]>()
    for (const seat of seats) {
      const letter = seat.label[0] ?? '?'
      const list = map.get(letter) ?? []
      list.push(seat)
      map.set(letter, list)
    }
    return [...map.entries()]
  }, [seats])

  const mine = new Set(held)

  function toggle(seat: Seat) {
    if (seat.status === 'BOOKED') return
    if (seat.status === 'HELD' && !mine.has(seat.id)) return
    setError(null)
    setSelected((cur) => {
      if (cur.includes(seat.id)) return cur.filter((x) => x !== seat.id)
      if (cur.length >= 10) {
        setError('You can select at most 10 seats')
        return cur
      }
      return [...cur, seat.id]
    })
  }

  async function holdSeats() {
    setError(null)
    setBooking(null)
    setHolding(true)
    try {
      const res = await api.hold(eventId, selected)
      setHeld(res.seatIds)
      setRemaining(res.expiresInSeconds)
      idempotencyKey.current = crypto.randomUUID()
      await loadSeats()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(conflict)
        await loadSeats().catch(() => {})
      } else {
        setError(err instanceof Error ? err.message : 'Hold failed')
      }
    } finally {
      setHolding(false)
    }
  }

  async function confirmBooking() {
    setError(null)
    setConfirming(true)
    const key = idempotencyKey.current ?? crypto.randomUUID()
    idempotencyKey.current = key
    try {
      const res = await api.book(eventId, held.length ? held : selected, key)
      setBooking(res)
      setHeld([])
      setSelected([])
      setRemaining(0)
      await loadSeats()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(conflict)
        setHeld([])
        setRemaining(0)
        await loadSeats().catch(() => {})
      } else {
        setError(err instanceof Error ? err.message : 'Booking failed')
      }
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <h1 className="font-serif text-xl tracking-wide">Choose your seats</h1>
        <div className="flex flex-wrap gap-2 text-[11px] text-stone-400">
          <Legend color="bg-emerald-500" label="Available" />
          <Legend color="bg-yellow-400" label="Held" />
          <Legend color="bg-sky-500" label="Mine / Held by you" />
          <Legend color="bg-stone-600" label="Booked" />
          <Legend color="bg-amber-300" label="Selected" />
        </div>
      </div>
      <ErrorBox message={error} />
      {booking && (
        <div className="shrink-0 rounded-md border border-emerald-400/30 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-200">
          Booking #{booking.id} confirmed. Seats: {booking.seats.join(', ')}. Total: {booking.total}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-white/10 bg-[#1b1216] px-3 py-2">
        <div className="mb-3 w-3/5 max-w-md">
          <div className="h-1.5 rounded-b-full bg-gradient-to-r from-amber-200/20 via-amber-100 to-amber-200/20 shadow-[0_8px_24px_rgba(251,191,36,0.25)]" />
          <p className="mt-1 text-center text-[10px] tracking-[0.4em] text-amber-200/70">STAGE</p>
        </div>
        <div className="flex min-h-0 w-full flex-col items-center justify-center gap-1">
          {rows.map(([letter, rowSeats]) => (
            <div key={letter} className="flex items-center gap-2">
              <span className="w-4 text-right text-[10px] text-stone-500">{letter}</span>
              <div className="flex gap-1">
                {rowSeats.map((seat) => {
                  const isMine = mine.has(seat.id)
                  const isSelected = selected.includes(seat.id)
                  return (
                    <button
                      key={seat.id}
                      title={`${seat.label} · ${seat.price}${isMine ? ' · Held by you' : ''}`}
                      className={`h-7 w-7 rounded-t-md text-[9px] leading-7 ${seatClass(seat, isSelected, isMine)}`}
                      onClick={() => toggle(seat)}
                      disabled={seat.status === 'BOOKED' || (seat.status === 'HELD' && !isMine)}
                    >
                      {seat.label.replace(/^[A-Z]/, '')}
                    </button>
                  )
                })}
              </div>
              <span className="w-4 text-[10px] text-stone-500">{letter}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          className="rounded-full bg-amber-300 px-4 py-1.5 text-sm font-medium text-stone-900 disabled:opacity-40"
          disabled={holding || selected.length === 0}
          onClick={holdSeats}
        >
          {holding ? 'Holding…' : 'Hold seats'}
        </button>
        {held.length > 0 && (
          <span className="text-xs text-sky-300">
            Mine / Held by you: {seats.filter((s) => held.includes(s.id)).map((s) => s.label).join(', ')}
          </span>
        )}
        {remaining > 0 && (
          <>
            <span className="text-xs text-stone-400">Hold expires in {remaining}s</span>
            <button
              className="rounded-full bg-sky-500 px-4 py-1.5 text-sm text-white disabled:opacity-40"
              disabled={confirming || held.length === 0}
              onClick={confirmBooking}
            >
              {confirming ? 'Confirming…' : 'Confirm booking'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-t-sm ${color}`} />
      {label}
    </span>
  )
}

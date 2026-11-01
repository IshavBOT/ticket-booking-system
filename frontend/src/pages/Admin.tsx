import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { ErrorBox } from '../auth'

export default function Admin() {
  const [name, setName] = useState('')
  const [venue, setVenue] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [rows, setRows] = useState(5)
  const [seatsPerRow, setSeatsPerRow] = useState(10)
  const [price, setPrice] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    setPending(true)
    try {
      await api.createEvent({
        name,
        venue,
        startsAt: new Date(startsAt).toISOString(),
        rows,
        seatsPerRow,
        price,
      })
      setOk('Event created')
      setName('')
      setVenue('')
      setStartsAt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setPending(false)
    }
  }

  const field = 'rounded-lg border border-white/10 bg-[#140e12] px-3 py-1.5 text-sm outline-none focus:border-amber-300/60'

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center overflow-hidden">
      <h1 className="mb-3 font-serif text-xl tracking-wide">Create event</h1>
      <ErrorBox message={error} />
      {ok && (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-200">{ok}</div>
      )}
      <form className="mt-2 flex flex-col gap-2" onSubmit={onSubmit}>
        <input className={field} required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={field} required placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <input className={field} required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <label className="text-xs text-stone-400">
          Rows (1–26)
          <input
            className={`mt-1 w-full ${field}`}
            type="number"
            min={1}
            max={26}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-stone-400">
          Seats per row (1–100)
          <input
            className={`mt-1 w-full ${field}`}
            type="number"
            min={1}
            max={100}
            value={seatsPerRow}
            onChange={(e) => setSeatsPerRow(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-stone-400">
          Price
          <input
            className={`mt-1 w-full ${field}`}
            type="number"
            min={1}
            step={1}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </label>
        <button className="rounded-full bg-amber-300 py-2 text-sm font-medium text-stone-900 disabled:opacity-50" disabled={pending}>
          {pending ? 'Creating…' : 'Create event'}
        </button>
      </form>
    </div>
  )
}

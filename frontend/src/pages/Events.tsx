import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Event } from '../api'
import { ErrorBox } from '../auth'

export default function Events() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .events()
      .then(setEvents)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load events'))
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <h1 className="shrink-0 font-serif text-xl tracking-wide">Now showing</h1>
      <ErrorBox message={error} />
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-hidden sm:grid-cols-3">
        {events.map((ev) => (
          <button
            key={ev.id}
            className="rounded-xl border border-white/10 bg-[#1c1418] p-4 text-left hover:border-amber-300/50"
            onClick={() => navigate(`/events/${ev.id}`)}
          >
            <div className="font-serif text-lg">{ev.name}</div>
            <div className="text-xs text-stone-400">{ev.venue}</div>
            <div className="text-xs text-stone-400">{new Date(ev.starts_at).toLocaleString()}</div>
            <div className="mt-2 text-xs text-amber-200/80">{ev.available} seats left</div>
          </button>
        ))}
      </div>
      {!error && events.length === 0 && <p className="text-sm text-stone-500">No events yet.</p>}
    </div>
  )
}

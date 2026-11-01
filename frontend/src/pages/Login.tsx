import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, getUser, setToken } from '../api'
import { ErrorBox, useAuth } from '../auth'

export default function Login() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (user ?? getUser()) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const { token } = mode === 'login' ? await api.login(email, password) : await api.register(email, password)
      setToken(token)
      setUser(getUser())
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center overflow-hidden bg-[#140e12] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1c1418] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="mb-1 text-center font-serif text-xs tracking-[0.35em] text-amber-200/80">THEATRE</p>
        <h1 className="mb-4 text-center font-serif text-2xl">{mode === 'login' ? 'Log in' : 'Register'}</h1>
        <ErrorBox message={error} />
        <form className="mt-3 flex flex-col gap-3" onSubmit={onSubmit}>
          <input
            className="rounded-lg border border-white/10 bg-[#140e12] px-3 py-2 text-sm outline-none focus:border-amber-300/60"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="rounded-lg border border-white/10 bg-[#140e12] px-3 py-2 text-sm outline-none focus:border-amber-300/60"
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="rounded-full bg-amber-300 py-2 text-sm font-medium text-stone-900 disabled:opacity-50"
            disabled={pending}
          >
            {pending ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <button
          className="mt-4 w-full text-center text-xs text-stone-400 underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>
        <button
          type="button"
          className="mt-4 w-full rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-left text-xs text-stone-400"
          onClick={() => {
            setEmail('admin@example.com')
            setPassword('12345678')
          }}
        >
          <span className="block text-[10px] tracking-wide text-amber-200/70">TEST ADMIN</span>
          email: admin@example.com
          <br />
          password: 12345678
        </button>
      </div>
    </div>
  )
}

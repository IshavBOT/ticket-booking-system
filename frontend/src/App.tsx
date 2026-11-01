import type { ReactNode } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { clearToken } from './api'
import { AuthProvider, useAuth } from './auth'
import Admin from './pages/Admin'
import Bookings from './pages/Bookings'
import EventSeats from './pages/EventSeats'
import Events from './pages/Events'
import Login from './pages/Login'

function RequireAuth({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function Layout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-1 text-xs tracking-wide ${isActive ? 'bg-amber-300 text-stone-900' : 'text-stone-300 hover:bg-white/10'}`

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#140e12] text-stone-100">
      <nav className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#1c1418] px-4 py-2">
        <span className="mr-2 font-serif text-sm tracking-[0.2em] text-amber-200">THEATRE</span>
        <NavLink to="/" className={link} end>
          Events
        </NavLink>
        <NavLink to="/bookings" className={link}>
          My Bookings
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={link}>
            Admin
          </NavLink>
        )}
        <span className="ml-auto text-xs text-stone-400">{user?.email}</span>
        <button
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-stone-300 hover:bg-white/10"
          onClick={() => {
            clearToken()
            setUser(null)
            navigate('/login')
          }}
        >
          Logout
        </button>
      </nav>
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 py-3">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Events />} />
          <Route path="/events/:id" element={<EventSeats />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route
            path="/admin"
            element={
              <RequireAuth admin>
                <Admin />
              </RequireAuth>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { getUser, type User } from './api'

const AuthContext = createContext<{ user: User | null; setUser: (u: User | null) => void }>({
  user: null,
  setUser: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getUser())
  const value = useMemo(() => ({ user, setUser }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-md border border-red-400/40 bg-red-950/70 px-3 py-1.5 text-xs text-red-200">{message}</div>
  )
}

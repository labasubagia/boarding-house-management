import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { useAuth } from '../hooks/useAuth'
import { isDummy } from '../lib/supabase'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

export default function Layout() {
  const navigate = useNavigate()
  const { session } = useAuth()

  async function logout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="font-bold text-indigo-700">
            Kos Tracker
            {isDummy && (
              <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                Dummy
              </span>
            )}
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/kamar" className={linkClass}>
              Kamar
            </NavLink>
            <NavLink to="/riwayat" className={linkClass}>
              Riwayat
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4 pb-16">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-6 flex items-center justify-between text-xs text-slate-400">
        <span>{session?.user.email}</span>
        <button onClick={logout} className="underline hover:text-slate-600">
          Keluar
        </button>
      </footer>
    </div>
  )
}

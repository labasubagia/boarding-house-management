import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider } from './hooks/AuthContext'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import RoomDetail from './pages/RoomDetail'
import ManageRooms from './pages/ManageRooms'
import History from './pages/History'

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
      Memuat…
    </div>
  )
}

function AuthGate({ children, when }: { children: ReactNode; when: 'authed' | 'guest' }) {
  const { session, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (when === 'authed' && !session) return <Navigate to="/login" replace />
  if (when === 'guest' && session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <AuthGate when="guest">
                <Login />
              </AuthGate>
            }
          />
          <Route
            element={
              <AuthGate when="authed">
                <Layout />
              </AuthGate>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/kamar/:roomId" element={<RoomDetail />} />
            <Route path="/kamar" element={<ManageRooms />} />
            <Route path="/riwayat" element={<History />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

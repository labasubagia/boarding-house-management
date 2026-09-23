import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPassword } from '../lib/auth'
import { isDummy } from '../lib/supabase'
import { Field, buttonPrimary, inputClass } from '../components/form'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = await signInWithPassword(email, password)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-bold text-indigo-700 mb-1">Kos Tracker</h1>
        <p className="text-sm text-slate-500 mb-4">Masuk untuk mengelola pembayaran kamar.</p>
        {isDummy && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Mode dummy</strong> — data disimpan lokal di browser (localStorage). Isi email &
            password apa saja. Bukan data produksi.
          </div>
        )}
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button type="submit" disabled={loading} className={buttonPrimary}>
          {loading ? 'Masuk…' : 'Masuk'}
        </button>
      </form>
    </div>
  )
}

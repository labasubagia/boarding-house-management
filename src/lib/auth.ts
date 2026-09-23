import type { Session } from '@supabase/supabase-js'
import { clearSession, getSession as getDummyEmail, setSession } from './localStore'
import { getSupabase, isSupabaseConfigured } from './supabase'

const listeners = new Set<(session: Session | null) => void>()

function dummySession(email: string): Session {
  return {
    access_token: 'dummy',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'dummy',
    user: {
      id: 'dummy-user',
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Session['user'],
  } as Session
}

export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    const email = getDummyEmail()
    return email ? dummySession(email) : null
  }
  const supabase = await getSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!isSupabaseConfigured) {
    if (!email || !password) return 'Email dan password wajib diisi.'
    setSession(email)
    emit(dummySession(email))
    return null
  }
  const supabase = await getSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message
  }
  return null
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) {
    clearSession()
    emit(null)
    return
  }
  const supabase = await getSupabase()
  await supabase.auth.signOut()
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  listeners.add(cb)
  let unsubSupabase: (() => void) | null = null
  let disposed = false

  if (isSupabaseConfigured) {
    void getSupabase().then((supabase) => {
      if (disposed) return
      const { data } = supabase.auth.onAuthStateChange((_e, s) => {
        if (!disposed) cb(s)
      })
      unsubSupabase = () => {
        void data.subscription.unsubscribe()
      }
    })
  }

  return () => {
    disposed = true
    listeners.delete(cb)
    unsubSupabase?.()
  }
}

function emit(session: Session | null): void {
  listeners.forEach((cb) => cb(session))
}

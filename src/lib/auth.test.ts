import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  getSession,
  signInWithPassword,
  signOut,
} from './auth'
import { isDummy } from './supabase'

// Force dummy path: no VITE_SUPABASE_* in test env
describe('dummy auth flow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs in dummy mode without Supabase env', () => {
    expect(isDummy).toBe(true)
  })

  it('rejects empty credentials', async () => {
    expect(await signInWithPassword('', '')).toContain('wajib')
  })

  it('signs in with any email/password and persists session', async () => {
    const err = await signInWithPassword('ayah@kos.test', 'rahasia')
    expect(err).toBeNull()
    const session = await getSession()
    expect(session?.user.email).toBe('ayah@kos.test')
  })

  it('signOut clears session', async () => {
    await signInWithPassword('ibu@kos.test', 'rahasia')
    await signOut()
    expect(await getSession()).toBeNull()
  })
})

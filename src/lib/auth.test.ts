import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  getSession,
  onAuthChange,
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

describe('onAuthChange listener', () => {
  it('subscribe → emit on signIn/signOut → unsubscribe stops', async () => {
    const seen: (string | null)[] = []
    const off1 = onAuthChange((s) => {
      seen.push(s?.user.email ?? null)
    })
    const off2 = onAuthChange(() => {})
    await signInWithPassword('listener@kos.test', 'rahasia')
    await signOut()
    off2()
    await signInWithPassword('kedua@kos.test', 'rahasia')
    await signOut()
    off1()
    expect(seen).toEqual(['listener@kos.test', null, 'kedua@kos.test', null])
    await signInWithPassword('ketiga@kos.test', 'rahasia')
    expect(seen).toHaveLength(4)
    await signOut()
  })
})

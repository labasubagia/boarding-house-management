import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  groupPaymentsByTenant,
  useAllPayments,
  useBaseData,
  usePaymentsForMonth,
  usePaymentsForTenant,
} from './useData'
import type { Payment } from '../lib/types'
import { resetDb } from '../lib/localStore'
import { fetchBase, insertTenant, upsertPayment } from '../lib/api'

function payment(tenant_id: string, period_month: string): Payment {
  return {
    id: `${tenant_id}-${period_month}`,
    tenant_id,
    period_month,
    paid_date: period_month.slice(0, 7) + '-10',
    amount: 1500000,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

async function seedTenant(name: string) {
  const base = await fetchBase()
  const occupied = new Set(base.tenants.filter((t) => t.is_active).map((t) => t.room_id))
  const room = base.rooms.find((r) => !occupied.has(r.id))
  if (!room) throw new Error('no vacant room for test')
  await insertTenant({
    room_id: room.id,
    name,
    phone: null,
    move_in_date: '2026-01-17',
    rent: 1500000,
  })
  const after = await fetchBase()
  const tenant = after.tenants.find((t) => t.name === name)
  if (!tenant) throw new Error('tenant not seeded')
  return { room, tenant }
}

function mountHook<T>(hook: () => T) {
  let current!: T
  function Comp() {
    current = hook()
    return null
  }
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root: Root = createRoot(el)
  return {
    get current() {
      return current
    },
    async mount() {
      await act(async () => {
        root.render(createElement(Comp))
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      el.remove()
    },
  }
}

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function waitFor(cond: () => boolean) {
  await vi.waitFor(async () => {
    await act(async () => {})
    if (!cond()) throw new Error('not yet')
  })
}

async function flush() {
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  resetDb()
})

describe('groupPaymentsByTenant', () => {
  it('groups rows per tenant, missing → [], unknown ignored', () => {
    const rows = [payment('a', '2026-02-01'), payment('b', '2026-01-01'), payment('zzz', '2026-01-01')]
    const grouped = groupPaymentsByTenant(rows, ['a', 'b', 'c'])
    expect(grouped.get('a')).toHaveLength(1)
    expect(grouped.get('b')).toHaveLength(1)
    expect(grouped.get('c')).toEqual([])
    expect(grouped.has('zzz')).toBe(false)
  })
})

describe('cancel path', () => {
  it('unmount before resolve skips setState (no act warning)', async () => {
    const h = mountHook(() => useAllPayments(['ghost']))
    await h.mount()
    h.unmount()
    await flush()
  })
})
describe('useBaseData', () => {
  it('loads seed buildings/rooms/tenants and reloads', async () => {
    const h = mountHook(() => useBaseData())
    await h.mount()
    await waitFor(() => h.current.buildings.length > 0)
    expect(h.current.buildings.map((b) => b.name).sort()).toEqual(['Gedung A', 'Gedung B'])
    expect(h.current.rooms).toHaveLength(10)
    expect(h.current.loading).toBe(false)
    expect(h.current.error).toBeNull()
    await act(async () => {
      await h.current.reload()
    })
    expect(h.current.rooms).toHaveLength(10)
    h.unmount()
  })
})

describe('usePaymentsForMonth', () => {
  it('returns month rows and surfaces invalid month as error', async () => {
    const { tenant } = await seedTenant('Hook Bulanan')
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: null,
    })
    const h = mountHook(() => usePaymentsForMonth('2026-02'))
    await h.mount()
    await waitFor(() => !h.current.loading)
    expect(h.current.payments.some((p) => p.tenant_id === tenant.id)).toBe(true)
    expect(h.current.error).toBeNull()
    h.unmount()

    const bad = mountHook(() => usePaymentsForMonth('2026-13'))
    await bad.mount()
    await waitFor(() => bad.current.error !== null)
    expect(bad.current.error).toMatch('tidak valid')
    bad.unmount()
  })
})

describe('usePaymentsForTenant', () => {
  it('null → [], id → rows, reload refreshes', async () => {
    const none = mountHook(() => usePaymentsForTenant(null))
    await none.mount()
    await flush()
    expect(none.current.payments).toEqual([])
    expect(none.current.error).toBeNull()
    none.unmount()

    const { tenant } = await seedTenant('Hook Tenant')
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: null,
    })
    const h = mountHook(() => usePaymentsForTenant(tenant.id))
    await h.mount()
    await waitFor(() => h.current.payments.length > 0)
    expect(h.current.error).toBeNull()
    await act(async () => {
      await h.current.reload()
    })
    expect(h.current.payments).toHaveLength(1)
    h.unmount()
  })
})

describe('useAllPayments', () => {
  it('batches one query grouped per tenant, empty ids → empty map', async () => {
    const first = await seedTenant('Hook A')
    const second = await seedTenant('Hook B')
    await upsertPayment({
      tenant_id: first.tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: null,
    })
    const h = mountHook(() => useAllPayments([first.tenant.id, second.tenant.id]))
    await h.mount()
    await waitFor(() => h.current.byTenant.size === 2)
    expect(h.current.byTenant.get(first.tenant.id)).toHaveLength(1)
    expect(h.current.byTenant.get(second.tenant.id)).toEqual([])
    expect(h.current.error).toBeNull()
    h.unmount()

    const empty = mountHook(() => useAllPayments([]))
    await empty.mount()
    await flush()
    expect(empty.current.byTenant.size).toBe(0)
    expect(empty.current.error).toBeNull()
    empty.unmount()
  })
})

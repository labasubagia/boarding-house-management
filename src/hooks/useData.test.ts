import { describe, expect, it } from 'vitest'
import { groupPaymentsByTenant } from './useData'
import type { Payment } from '../lib/types'

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

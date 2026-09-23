import { describe, expect, it } from 'vitest'
import {
  computeStatus,
  dueDateForMonth,
  formatDateID,
  formatMonthID,
  isPastDue,
  monthKeyToDate,
  startOfMonth,
  toLocalISO,
  toMonthKey,
} from './dueDate'
import type { Tenant } from './types'

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't1',
    room_id: 'r1',
    name: 'Budi',
    phone: null,
    move_in_date: '2026-01-17',
    rent: 1500000,
    is_active: true,
    move_out_date: null,
    created_at: '2026-01-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('toMonthKey / monthKeyToDate / startOfMonth', () => {
  it('formats local Date as YYYY-MM', () => {
    expect(toMonthKey(new Date(2026, 0, 15))).toBe('2026-01')
    expect(toMonthKey(new Date(2026, 11, 31))).toBe('2026-12')
  })

  it('parses month key to first of month (local)', () => {
    const d = monthKeyToDate('2026-03')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(1)
  })

  it('startOfMonth normalizes any day to day 1', () => {
    expect(toLocalISO(startOfMonth(new Date(2026, 5, 18)))).toBe('2026-06-01')
  })
})

describe('toLocalISO', () => {
  it('formats YYYY-MM-DD in local timezone (no UTC shift)', () => {
    const d = new Date(2026, 0, 17)
    expect(toLocalISO(d)).toBe('2026-01-17')
  })

  it('pads month and day', () => {
    expect(toLocalISO(new Date(2026, 2, 5))).toBe('2026-03-05')
  })
})

describe('dueDateForMonth — deadline is day of move-in each month', () => {
  it('uses move-in day of month as due day', () => {
    const due = dueDateForMonth('2026-01-17', '2026-02')
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(1)
    expect(due.getDate()).toBe(17)
  })

  it('keeps the same due day across later months', () => {
    expect(dueDateForMonth('2026-01-17', '2026-03').getDate()).toBe(17)
    expect(dueDateForMonth('2026-01-17', '2026-12').getDate()).toBe(17)
    expect(dueDateForMonth('2026-01-17', '2027-01').getDate()).toBe(17)
  })

  it('is not affected by early payment (deadline still from move-in only)', () => {
    // Paid on day 1; due must still be day 17
    const due = dueDateForMonth('2026-01-17', '2026-03')
    expect(due.getDate()).toBe(17)
  })

  it('clamps short months: Jan 31 → Feb 28 (non-leap)', () => {
    const due = dueDateForMonth('2026-01-31', '2026-02')
    expect(due.getMonth()).toBe(1)
    expect(due.getDate()).toBe(28)
  })

  it('clamps leap year: Jan 31 → Feb 29', () => {
    const due = dueDateForMonth('2024-01-31', '2024-02')
    expect(due.getDate()).toBe(29)
  })

  it('handles day 31 in long months', () => {
    expect(dueDateForMonth('2026-01-31', '2026-03').getDate()).toBe(31)
    expect(dueDateForMonth('2026-01-31', '2026-05').getDate()).toBe(31)
  })

  it('does not treat due as past before move-in month', () => {
    const due = dueDateForMonth('2026-06-15', '2026-05')
    expect(startOfMonth(due)).toEqual(startOfMonth(new Date(2026, 5, 15)))
  })
})

describe('isPastDue', () => {
  it('false on due date itself (still within day)', () => {
    const due = new Date(2026, 1, 17)
    expect(isPastDue(due, new Date(2026, 1, 17, 12, 0))).toBe(false)
    expect(isPastDue(due, new Date(2026, 1, 17, 23, 59))).toBe(false)
  })

  it('true after end of due date', () => {
    const due = new Date(2026, 1, 17)
    expect(isPastDue(due, new Date(2026, 1, 18, 0, 1))).toBe(true)
    expect(isPastDue(due, new Date(2026, 1, 18, 9, 0))).toBe(true)
  })

  it('false before due date', () => {
    const due = new Date(2026, 1, 17)
    expect(isPastDue(due, new Date(2026, 1, 16, 23, 0))).toBe(false)
  })
})

describe('computeStatus — room status business rules', () => {
  const monthKey = '2026-02'

  it('vacant room → kosong even if no payment', () => {
    expect(
      computeStatus({ tenant: null, hasPayment: false, monthKey, today: new Date(2026, 1, 10) }),
    ).toBe('kosong')
  })

  it('payment recorded → lunas regardless of date', () => {
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-01-17' }),
        hasPayment: true,
        monthKey,
        today: new Date(2026, 1, 20),
      }),
    ).toBe('lunas')
  })

  it('no payment before due → belum', () => {
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-01-17' }),
        hasPayment: false,
        monthKey,
        today: new Date(2026, 1, 10),
      }),
    ).toBe('belum')
  })

  it('no payment on due date → belum (not yet past)', () => {
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-01-17' }),
        hasPayment: false,
        monthKey,
        today: new Date(2026, 1, 17, 15, 0),
      }),
    ).toBe('belum')
  })

  it('no payment after due → terlambat', () => {
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-01-17' }),
        hasPayment: false,
        monthKey,
        today: new Date(2026, 1, 18),
      }),
    ).toBe('terlambat')
  })

  it('early payment last month does not mark this month lunas', () => {
    // hasPayment is for selected month only
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-01-05' }),
        hasPayment: false,
        monthKey: '2026-03',
        today: new Date(2026, 2, 4),
      }),
    ).toBe('belum')
  })
})

describe('locale formatting', () => {
  it('formatMonthID renders Indonesian month + year', () => {
    expect(formatMonthID('2026-02')).toContain('2026')
    expect(formatMonthID('2026-02').toLowerCase()).toContain('februari')
  })

  it('formatDateID renders a date without timezone shift', () => {
    expect(formatDateID('2026-01-17')).toContain('2026')
    expect(formatDateID('2026-01-17')).toContain('17')
  })
})

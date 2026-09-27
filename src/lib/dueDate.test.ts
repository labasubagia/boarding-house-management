import { describe, expect, it } from 'vitest'
import {
  arrearsBefore,
  computeStatus,
  dueDateForMonth,
  formatCurrency,
  formatDateID,
  formatMonthID,
  isPastDue,
  isOverduePeriod,
  monthKeyToDate,
  occupantForMonth,
  overdueBefore,
  periodMonthEquals,
  roomStatus,
  shiftMonth,
  startOfMonth,
  toLocalISO,
  toMonthKey,
  unpaidPeriods,
  unpaidThrough,
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
  } as Tenant
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
  function mustDue(moveIn: string, month: string): Date {
    const due = dueDateForMonth(moveIn, month)
    expect(due).not.toBeNull()
    return due as Date
  }

  it('uses move-in day of month as due day', () => {
    const due = mustDue('2026-01-17', '2026-02')
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(1)
    expect(due.getDate()).toBe(17)
  })

  it('keeps the same due day across later months', () => {
    expect(mustDue('2026-01-17', '2026-03').getDate()).toBe(17)
    expect(mustDue('2026-01-17', '2026-12').getDate()).toBe(17)
    expect(mustDue('2026-01-17', '2027-01').getDate()).toBe(17)
  })

  it('is not affected by early payment (deadline still from move-in only)', () => {
    expect(mustDue('2026-01-17', '2026-03').getDate()).toBe(17)
  })

  it('clamps short months: Jan 31 → Feb 28 (non-leap)', () => {
    const due = mustDue('2026-01-31', '2026-02')
    expect(due.getMonth()).toBe(1)
    expect(due.getDate()).toBe(28)
  })

  it('clamps leap year: Jan 31 → Feb 29', () => {
    expect(mustDue('2024-01-31', '2024-02').getDate()).toBe(29)
  })

  it('handles day 31 in long months', () => {
    expect(mustDue('2026-01-31', '2026-03').getDate()).toBe(31)
    expect(mustDue('2026-01-31', '2026-05').getDate()).toBe(31)
  })

  it('returns null before move-in month (not renting yet)', () => {
    expect(dueDateForMonth('2026-06-15', '2026-05')).toBeNull()
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

  it('month before move-in is belum even if today is long past move-in', () => {
    // Regression: browsing May when move-in is Jun used to return terlambat
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-06-15' }),
        hasPayment: false,
        monthKey: '2026-05',
        today: new Date(2026, 8, 20),
      }),
    ).toBe('belum')
    expect(
      computeStatus({
        tenant: tenant({ move_in_date: '2026-06-15' }),
        hasPayment: false,
        monthKey: '2026-06',
        today: new Date(2026, 8, 20),
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

describe('shiftMonth / unpaidPeriods', () => {
  it('shifts across year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('lists arrears + current + 2 future, skips paid', () => {
    expect(unpaidPeriods('2026-01-17', ['2026-02-01'], '2026-03')).toEqual([
      '2026-01',
      '2026-03',
      '2026-04',
      '2026-05',
    ])
  })

  it('skips months before move-in', () => {
    expect(unpaidPeriods('2026-03-10', [], '2026-03')).toEqual(['2026-03', '2026-04', '2026-05'])
  })
})

describe('arrearsBefore / unpaidThrough / roomStatus', () => {
  it('arrearsBefore excludes the viewed month', () => {
    expect(arrearsBefore('2026-01-17', [], '2026-03')).toEqual(['2026-01', '2026-02'])
    expect(arrearsBefore('2026-03-10', [], '2026-03')).toEqual([])
  })

  it('unpaidThrough includes arrears + current', () => {
    expect(unpaidThrough('2026-01-17', ['2026-02-01'], '2026-03')).toEqual([
      '2026-01',
      '2026-03',
    ])
  })

  it('paid current month with unpaid arrears stays terlambat', () => {
    const t = tenant({ move_in_date: '2026-01-05' })
    const past = new Date(2026, 3, 20)
    expect(roomStatus({ tenant: t, paidKeys: ['2026-03'], monthKey: '2026-03', today: past })).toBe('terlambat')
    expect(
      roomStatus({ tenant: t, paidKeys: ['2026-01', '2026-02', '2026-03'], monthKey: '2026-03', today: past }),
    ).toBe('lunas')
  })

  it('viewing next month never marks not-yet-due as nunggak', () => {
    const t = tenant({ move_in_date: '2026-09-10' })
    const beforeDue = new Date(2026, 8, 5)
    expect(overdueBefore(t.move_in_date, [], '2026-10', beforeDue)).toEqual([])
    expect(isOverduePeriod(t.move_in_date, '2026-09', beforeDue)).toBe(false)
    expect(roomStatus({ tenant: t, paidKeys: [], monthKey: '2026-10', today: beforeDue })).toBe('belum')
    const afterDue = new Date(2026, 9, 15)
    expect(overdueBefore(t.move_in_date, [], '2026-10', afterDue)).toEqual(['2026-09'])
    expect(roomStatus({ tenant: t, paidKeys: [], monthKey: '2026-10', today: afterDue })).toBe('terlambat')
  })
})

describe('occupantForMonth — future tenant invisible', () => {
  it('active tenant not yet moved in → no occupant for earlier months', () => {
    const t = tenant({ id: 'new', room_id: 'r9', move_in_date: '2026-09-10', is_active: true })
    expect(occupantForMonth([t], 'r9', '2026-08')).toBeUndefined()
    expect(occupantForMonth([t], 'r9', '2026-09')?.id).toBe('new')
    expect(unpaidThrough(t.move_in_date, [], '2026-08')).toEqual([])
  })
})

describe('boundary coverage', () => {
  it('periodMonthEquals matches exact month only', () => {
    expect(periodMonthEquals('2026-01-01', '2026-01')).toBe(true)
    expect(periodMonthEquals('2026-02-01', '2026-01')).toBe(false)
    // A naive startsWith on '2026-1' would also match '2026-10'; exact slice avoids it
    expect(periodMonthEquals('2026-10-01', '2026-10')).toBe(true)
  })

  it('formatCurrency renders IDR without decimals', () => {
    const s = formatCurrency(1500000)
    expect(s).toContain('Rp')
    expect(s).not.toContain(',00')
  })

  it('moved-out tenant with past move_out stays visible that month', () => {
    const t = tenant({ id: 'old', room_id: 'r1', move_in_date: '2026-01-05', is_active: false, move_out_date: '2026-02-10' })
    expect(occupantForMonth([t], 'r1', '2026-02')?.id).toBe('old')
    const gone = tenant({ id: 'gone', room_id: 'r1', move_in_date: '2026-01-05', is_active: false, move_out_date: '2026-01-20' })
    expect(occupantForMonth([gone], 'r1', '2026-02')).toBeUndefined()
  })

  it('roomStatus null tenant is kosong', () => {
    expect(roomStatus({ tenant: null, paidKeys: [], monthKey: '2026-02' })).toBe('kosong')
  })
})

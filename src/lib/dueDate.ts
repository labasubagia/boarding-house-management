import type { RoomStatus, Tenant } from './types'

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function toMonthKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function monthKeyToDate(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1)
}
/** Shift `YYYY-MM` by n months (negative = backward). */
export function shiftMonth(monthKey: string, n: number): string {
  const d = monthKeyToDate(monthKey)
  return toMonthKey(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
/** Exact `YYYY-MM-01` period match (AVOID startsWith: monthKey prefix collisions). */
export function periodMonthEquals(periodMonth: string, monthKey: string): boolean {
  return periodMonth.slice(0, 7) === monthKey
}
/**
 * Unpaid billable months: from tenant move-in month through `currentKey + future`.
 * Skips paid keys. `ponytail:` fixed +2 window; add `future` param when advance-pay policy changes.
 */
export function unpaidPeriods(
  moveInDate: string,
  paidKeys: Iterable<string>,
  currentKey: string,
  future = 2,
): string[] {
  const paid = new Set([...paidKeys].map((k) => k.slice(0, 7)))
  const start = moveInDate.slice(0, 7)
  const end = shiftMonth(currentKey, future)
  const out: string[] = []
  for (let k = start; k <= end; k = shiftMonth(k, 1)) out.push(k)
  return out.filter((k) => !paid.has(k))
}
/** Unpaid months strictly before viewed month (arrears). */
export function arrearsBefore(moveInDate: string, paidKeys: Iterable<string>, monthKey: string): string[] {
  return unpaidPeriods(moveInDate, paidKeys, shiftMonth(monthKey, -1), 0)
}
/** Unpaid months through viewed month (arrears + current). */
export function unpaidThrough(moveInDate: string, paidKeys: Iterable<string>, monthKey: string): string[] {
  return unpaidPeriods(moveInDate, paidKeys, monthKey, 0)
}
/** True when billing period's due date has passed (overdue debt, not just unpaid early). */
export function isOverduePeriod(moveInDate: string, periodKey: string, today: Date = new Date()): boolean {
  const due = dueDateForMonth(moveInDate, periodKey)
  return due !== null && isPastDue(due, today)
}
/** Past unpaid periods whose due date has passed (`nunggak`; excludes not-yet-due). */
export function overdueBefore(
  moveInDate: string,
  paidKeys: Iterable<string>,
  monthKey: string,
  today: Date = new Date(),
): string[] {
  return arrearsBefore(moveInDate, paidKeys, monthKey).filter((k) => isOverduePeriod(moveInDate, k, today))
}
/**
 * Room status with arrears override: paid current month + unpaid past
 * still `terlambat` so debt never hides behind "lunas bulan ini".
 * `nunggak` = due date passed (`overdueBefore`), not merely calendar-past:
 * viewing next month never marks not-yet-due periods as overdue.
 */
export function roomStatus(opts: {
  tenant: Tenant | null | undefined
  paidKeys: Iterable<string>
  monthKey: string
  today?: Date
}): RoomStatus {
  const { tenant, paidKeys, monthKey, today } = opts
  const now = today ?? new Date()
  if (!tenant) return 'kosong'
  const paid = new Set([...paidKeys].map((k) => k.slice(0, 7)))
  if (overdueBefore(tenant.move_in_date, paid, monthKey, now).length > 0) return 'terlambat'
  return computeStatus({ tenant, hasPayment: paid.has(monthKey), monthKey, today: now })
}
export function formatMonthID(monthKey: string): string {
  return monthKeyToDate(monthKey).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateID(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Local-date-safe YYYY-MM-DD (avoid Date#toISOString UTC shift). */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Due date for a given month, based on day of move_in_date.
 * Clamps short months (e.g. Jan 31 → Feb 28).
 * Returns null when the selected month is before the move-in month (not yet renting).
 */
export function dueDateForMonth(moveInDate: string, monthKey: string): Date | null {
  const [y, m] = monthKey.split('-').map(Number)
  const [miY, miM, miD] = moveInDate.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const dueDay = Math.min(miD, lastDay)
  const due = new Date(y, m - 1, dueDay)
  const moveIn = new Date(miY, miM - 1, miD)
  if (startOfMonth(due) < startOfMonth(moveIn)) {
    return null
  }
  return due
}

export function isPastDue(dueDate: Date, today: Date): boolean {
  const endOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 23, 59, 59)
  return today > endOfDue
}

export function computeStatus(opts: {
  tenant: Tenant | null | undefined
  hasPayment: boolean
  monthKey: string
  today?: Date
}): RoomStatus {
  const { tenant, hasPayment, monthKey } = opts
  const today = opts.today ?? new Date()
  if (!tenant) return 'kosong'
  if (hasPayment) return 'lunas'
  const due = dueDateForMonth(tenant.move_in_date, monthKey)
  // Viewing a month before move-in: not renting yet → not overdue (docs: belum dianggap jatuh tempo)
  if (!due) return 'belum'
  return isPastDue(due, today) ? 'terlambat' : 'belum'
}

/**
 * Occupant billed for a room in `monthKey`: active tenant wins only when
 * already moved in (`move_in` month <= viewed month); else tenant whose
 * [move_in, move_out) covers the month (keeps past months `lunas`,
 * not `kosong`, after move-out; future tenant stays invisible before masuk).
 */
export function occupantForMonth(
  tenants: Tenant[],
  roomId: string,
  monthKey: string,
): Tenant | undefined {
  const inRoom = tenants.filter((t) => t.room_id === roomId)
  const active = inRoom.find((t) => t.is_active)
  if (active && active.move_in_date.slice(0, 7) <= monthKey) return active
  const monthStart = `${monthKey}-01`
  const dated = inRoom.filter((t) => t.move_in_date.slice(0, 7) <= monthKey)
  dated.sort((a, b) => b.move_in_date.localeCompare(a.move_in_date))
  return dated.find(
    (t) => !t.move_out_date || t.move_out_date >= monthStart,
  )
}

export const STATUS_LABEL: Record<RoomStatus, string> = {
  lunas: 'Lunas',
  belum: 'Belum bayar',
  terlambat: 'Terlambat',
  kosong: 'Kosong',
}

export const STATUS_CLASSES: Record<RoomStatus, string> = {
  lunas: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  belum: 'bg-amber-100 text-amber-800 border-amber-200',
  terlambat: 'bg-red-100 text-red-800 border-red-200',
  kosong: 'bg-slate-100 text-slate-600 border-slate-200',
}

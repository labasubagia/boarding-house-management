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

/** Due date for a given month, based on day of move_in_date. Clamps short months (e.g. Jan 31 → Feb 28). */
export function dueDateForMonth(moveInDate: string, monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number)
  const [miY, miM, miD] = moveInDate.split('-').map(Number)
  const day = miD
  const lastDay = new Date(y, m, 0).getDate()
  const moveInMonthIndex = miM - 1
  // If tenant moved in after this month's day in a later calendar sense, due still applies monthly from move-in anniversary
  const dueDay = Math.min(day, lastDay)
  const due = new Date(y, m - 1, dueDay)
  // Before move-in month: not yet due
  const moveIn = new Date(miY, moveInMonthIndex, miD)
  if (startOfMonth(due) < startOfMonth(moveIn)) {
    return moveIn
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
  return isPastDue(due, today) ? 'terlambat' : 'belum'
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

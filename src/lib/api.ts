import { loadDb, saveDb, resetDb, type DummyDb } from './localStore'
import { getSupabase, isSupabaseConfigured } from './supabase'
import type { Building, Payment, Room, Tenant } from './types'
import { uuid } from './uuid'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function reqName(v: string, label: string): string {
  const s = v.trim()
  if (!s) throw new Error(`${label} wajib diisi.`)
  return s
}

function reqMoney(n: number, label: string): number {
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} harus angka ≥ 0.`)
  return n
}

function reqDate(v: string, label: string): string {
  if (!DATE_RE.test(v)) throw new Error(`${label} tidak valid (YYYY-MM-DD).`)
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    throw new Error(`${label} tidak valid (YYYY-MM-DD).`)
  }
  return v
}

function reqMonthKey(monthKey: string): string {
  if (!MONTH_RE.test(monthKey)) throw new Error(`Bulan tidak valid (${monthKey}).`)
  return monthKey
}

const naturalName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function sortRooms<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => naturalName.compare(a.name, b.name))
}

type DbError = { code?: string; message?: string; details?: string; hint?: string }

/** Map Postgres/Supabase errors to Indonesian UI strings; unknown → rethrow as-is. */
export function friendlyDbError(e: DbError): Error {
  const code = e?.code ?? ''
  const hay = `${e?.message ?? ''} ${e?.details ?? ''} ${e?.hint ?? ''}`
  if (code === '23505' || /duplicate key/i.test(hay)) {
    if (hay.includes('uniq_active_tenant_per_room')) return new Error('Kamar sudah terisi penyewa aktif.')
    if (hay.includes('buildings')) return new Error('Nama gedung sudah ada.')
    if (hay.includes('rooms')) return new Error('Nama kamar sudah ada di gedung ini.')
    if (hay.includes('payments')) return new Error('Pembayaran periode ini sudah tercatat.')
    return new Error('Data sudah ada.')
  }
  if (code === '23514' || /check constraint/i.test(hay)) {
    if (hay.includes('rent')) return new Error('Sewa harus angka ≥ 0.')
    if (hay.includes('amount')) return new Error('Jumlah harus angka > 0.')
    if (hay.includes('move_out')) return new Error('Tanggal keluar tidak valid.')
    if (hay.includes('name')) return new Error('Nama wajib diisi.')
    return new Error('Data tidak valid.')
  }
  if (code === '23503' || /foreign key/i.test(hay)) return new Error('Data terkait tidak ditemukan.')
  return e instanceof Error ? e : new Error(e?.message ?? 'Gagal menyimpan data.')
}
function nowISO(): string {
  return new Date().toISOString()
}

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const endDay = new Date(y, m, 0).getDate()
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(endDay).padStart(2, '0')}`,
  }
}


async function withDb<T>(fn: (db: DummyDb) => { db: DummyDb; result: T }): Promise<T> {
  const db = loadDb()
  const { db: next, result } = fn(db)
  saveDb(next)
  return result
}

// ---- Read ----

export async function fetchBase(): Promise<{
  buildings: Building[]
  rooms: Room[]
  tenants: Tenant[]
}> {
  if (!isSupabaseConfigured) {
    const db = loadDb()
    return {
      buildings: sortRooms(db.buildings),
      rooms: sortRooms(db.rooms),
      tenants: [...db.tenants],
    }
  }
  const supabase = await getSupabase()
  const [b, r, t] = await Promise.all([
    supabase.from('buildings').select('*').order('name'),
    supabase.from('rooms').select('*').order('name'),
    supabase.from('tenants').select('*').order('created_at'),
  ])
  const err = b.error || r.error || t.error
  if (err) throw friendlyDbError(err)
  return { buildings: b.data ?? [], rooms: r.data ?? [], tenants: t.data ?? [] }
}

export async function fetchPaymentsForMonth(monthKey: string): Promise<Payment[]> {
  reqMonthKey(monthKey)
  const { start, end } = monthRange(monthKey)
  if (!isSupabaseConfigured) {
    const db = loadDb()
    return db.payments
      .filter((p) => p.period_month >= start && p.period_month <= end)
      .sort((a, b) => a.paid_date.localeCompare(b.paid_date))
  }
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .gte('period_month', start)
    .lte('period_month', end)
    .order('paid_date')
  if (error) throw friendlyDbError(error)
  return data ?? []
}

export async function fetchPaymentsForTenant(tenantId: string): Promise<Payment[]> {
  if (!isSupabaseConfigured) {
    const db = loadDb()
    return db.payments
      .filter((p) => p.tenant_id === tenantId)
      .sort((a, b) => b.period_month.localeCompare(a.period_month))
  }
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('period_month', { ascending: false })
  if (error) throw friendlyDbError(error)
  return data ?? []
}

/** Single batched query for many tenants (AVOIDs N+1: 1 round trip, not N). */
export async function fetchPaymentsForTenants(tenantIds: string[]): Promise<Payment[]> {
  if (tenantIds.length === 0) return []
  if (!isSupabaseConfigured) {
    const db = loadDb()
    const wanted = new Set(tenantIds)
    return db.payments
      .filter((p) => wanted.has(p.tenant_id))
      .sort((a, b) => b.period_month.localeCompare(a.period_month))
  }
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('tenant_id', tenantIds)
    .order('period_month', { ascending: false })
  if (error) throw friendlyDbError(error)
  return data ?? []
}

export async function insertBuilding(name: string): Promise<void> {
  const clean = reqName(name, 'Nama gedung')
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.buildings.push({ id: uuid(), name: clean, created_at: nowISO() })
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('buildings').insert({ name: clean })
  if (error) throw friendlyDbError(error)
}

export async function deleteBuilding(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      const roomIds = new Set(db.rooms.filter((r) => r.building_id === id).map((r) => r.id))
      const tenantIds = new Set(db.tenants.filter((t) => roomIds.has(t.room_id)).map((t) => t.id))
      return {
        db: {
          ...db,
          buildings: db.buildings.filter((b) => b.id !== id),
          rooms: db.rooms.filter((r) => r.building_id !== id),
          tenants: db.tenants.filter((t) => !tenantIds.has(t.id)),
          payments: db.payments.filter((p) => !tenantIds.has(p.tenant_id)),
        },
        result: undefined,
      }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('buildings').delete().eq('id', id)
  if (error) throw friendlyDbError(error)
}

// ---- Rooms ----
export async function insertRoom(payload: {
  building_id: string
  name: string
  rent: number
}): Promise<void> {
  const clean = { building_id: payload.building_id, name: reqName(payload.name, 'Nama kamar'), rent: reqMoney(payload.rent, 'Sewa') }
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.rooms.push({ id: uuid(), ...clean, created_at: nowISO() })
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('rooms').insert(clean)
  if (error) throw friendlyDbError(error)
}

export async function updateRoom(
  id: string,
  payload: { building_id: string; name: string; rent: number },
): Promise<void> {
  const clean = { building_id: payload.building_id, name: reqName(payload.name, 'Nama kamar'), rent: reqMoney(payload.rent, 'Sewa') }
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.rooms = db.rooms.map((r) => (r.id === id ? { ...r, ...clean } : r))
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('rooms').update(clean).eq('id', id)
  if (error) throw friendlyDbError(error)
}

export async function deleteRoom(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      const roomTenants = db.tenants.filter((t) => t.room_id === id)
      const tenantIds = new Set(roomTenants.map((t) => t.id))
      return {
        db: {
          ...db,
          rooms: db.rooms.filter((r) => r.id !== id),
          tenants: db.tenants.filter((t) => t.room_id !== id),
          payments: db.payments.filter((p) => !tenantIds.has(p.tenant_id)),
        },
        result: undefined,
      }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('rooms').delete().eq('id', id)
  if (error) throw friendlyDbError(error)
}

// ---- Tenants ----

export async function insertTenant(payload: {
  room_id: string
  name: string
  phone: string | null
  move_in_date: string
  rent: number
}): Promise<void> {
  const clean = {
    room_id: payload.room_id,
    name: reqName(payload.name, 'Nama penyewa'),
    phone: payload.phone?.trim() || null,
    move_in_date: reqDate(payload.move_in_date, 'Tanggal masuk'),
    rent: reqMoney(payload.rent, 'Sewa'),
  }
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      const occupied = db.tenants.some((t) => t.room_id === clean.room_id && t.is_active)
      if (occupied) throw new Error('Kamar sudah terisi penyewa aktif.')
      db.tenants.push({
        id: uuid(),
        ...clean,
        is_active: true,
        move_out_date: null,
        created_at: nowISO(),
      })
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('tenants').insert({ ...clean, is_active: true })
  if (error) throw friendlyDbError(error)
}
export async function updateTenant(
  id: string,
  payload: {
    room_id: string
    name: string
    phone: string | null
    move_in_date: string
    rent: number
  },
): Promise<void> {
  const clean = {
    room_id: payload.room_id,
    name: reqName(payload.name, 'Nama penyewa'),
    phone: payload.phone?.trim() || null,
    move_in_date: reqDate(payload.move_in_date, 'Tanggal masuk'),
    rent: reqMoney(payload.rent, 'Sewa'),
  }
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.tenants = db.tenants.map((t) => (t.id === id ? { ...t, ...clean } : t))
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('tenants').update(clean).eq('id', id)
  if (error) throw friendlyDbError(error)
}

export async function moveOutTenant(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.tenants = db.tenants.map((t) =>
        t.id === id ? { ...t, is_active: false, move_out_date: localToday() } : t,
      )
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase
    .from('tenants')
    .update({ is_active: false, move_out_date: localToday() })
    .eq('id', id)
  if (error) throw friendlyDbError(error)
}

// ---- Payments ----

/** Batch record N months in one call; rejects dup periods + pre-move-in periods. */
export async function recordPayments(input: {
  tenant_id: string
  move_in_date: string
  paid_date: string
  notes: string | null
  items: { period_month: string; amount: number }[]
}): Promise<{ count: number }> {
  const paidDate = reqDate(input.paid_date, 'Tanggal bayar')
  const notes = input.notes?.trim() || null
  if (input.items.length === 0) throw new Error('Pilih minimal 1 bulan.')
  const seen = new Set<string>()
  const start = input.move_in_date.slice(0, 7)
  const clean = input.items.map((it) => {
    const period = reqDate(it.period_month, 'Periode')
    if (period.slice(0, 7) < start) throw new Error('Periode sebelum tanggal masuk.')
    if (seen.has(period)) throw new Error('Periode duplikat.')
    seen.add(period)
    return { tenant_id: input.tenant_id, period_month: period, amount: reqMoney(it.amount, 'Jumlah') }
  })
  for (const c of clean) {
    await upsertPayment({ ...c, paid_date: paidDate, notes })
  }
  return { count: clean.length }
}

export async function upsertPayment(payload: {
  tenant_id: string
  period_month: string
  paid_date: string
  amount: number
  notes: string | null
}): Promise<void> {
  const clean = {
    tenant_id: payload.tenant_id,
    period_month: reqDate(payload.period_month, 'Periode'),
    paid_date: reqDate(payload.paid_date, 'Tanggal bayar'),
    amount: reqMoney(payload.amount, 'Jumlah'),
    notes: payload.notes?.trim() || null,
  }
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      const existing = db.payments.find(
        (p) => p.tenant_id === clean.tenant_id && p.period_month === clean.period_month,
      )
      if (existing) {
        db.payments = db.payments.map((p) => (p.id === existing.id ? { ...p, ...clean } : p))
      } else {
        db.payments.push({ id: uuid(), ...clean, created_at: nowISO() })
      }
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('payments').upsert(clean, {
    onConflict: 'tenant_id,period_month',
  })
  if (error) throw friendlyDbError(error)
}

export async function deletePayment(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.payments = db.payments.filter((p) => p.id !== id)
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) throw friendlyDbError(error)
}

export async function resetDummyData(): Promise<void> {
  if (isSupabaseConfigured) return
  resetDb()
}

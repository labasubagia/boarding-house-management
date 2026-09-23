import { loadDb, saveDb, resetDb, type DummyDb } from './localStore'
import { getSupabase, isSupabaseConfigured } from './supabase'
import type { Building, Payment, Room, Tenant } from './types'
import { uuid } from './uuid'

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
      buildings: [...db.buildings].sort((a, b) => a.name.localeCompare(b.name)),
      rooms: [...db.rooms].sort((a, b) => a.name.localeCompare(b.name)),
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
  if (err) throw err
  return { buildings: b.data ?? [], rooms: r.data ?? [], tenants: t.data ?? [] }
}

export async function fetchPaymentsForMonth(monthKey: string): Promise<Payment[]> {
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
  if (error) throw error
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
  if (error) throw error
  return data ?? []
}

// ---- Buildings ----

export async function insertBuilding(name: string): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.buildings.push({ id: uuid(), name: name.trim(), created_at: nowISO() })
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('buildings').insert({ name: name.trim() })
  if (error) throw error
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
  if (error) throw error
}

// ---- Rooms ----

export async function insertRoom(payload: {
  building_id: string
  name: string
  rent: number
}): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.rooms.push({
        id: uuid(),
        building_id: payload.building_id,
        name: payload.name.trim(),
        rent: payload.rent,
        created_at: nowISO(),
      })
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('rooms').insert({
    building_id: payload.building_id,
    name: payload.name.trim(),
    rent: payload.rent,
  })
  if (error) throw error
}

export async function updateRoom(
  id: string,
  payload: { building_id: string; name: string; rent: number },
): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.rooms = db.rooms.map((r) =>
        r.id === id
          ? { ...r, name: payload.name.trim(), rent: payload.rent, building_id: payload.building_id }
          : r,
      )
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('rooms').update(payload).eq('id', id)
  if (error) throw error
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
  if (error) throw error
}

// ---- Tenants ----

export async function insertTenant(payload: {
  room_id: string
  name: string
  phone: string | null
  move_in_date: string
  rent: number
}): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.tenants.push({
        id: uuid(),
        room_id: payload.room_id,
        name: payload.name.trim(),
        phone: payload.phone,
        move_in_date: payload.move_in_date,
        rent: payload.rent,
        is_active: true,
        move_out_date: null,
        created_at: nowISO(),
      })
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('tenants').insert({ ...payload, is_active: true })
  if (error) throw error
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
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      db.tenants = db.tenants.map((t) => (t.id === id ? { ...t, ...payload, name: payload.name.trim() } : t))
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('tenants').update(payload).eq('id', id)
  if (error) throw error
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
  if (error) throw error
}

// ---- Payments ----

export async function upsertPayment(payload: {
  tenant_id: string
  period_month: string
  paid_date: string
  amount: number
  notes: string | null
}): Promise<void> {
  if (!isSupabaseConfigured) {
    await withDb((db) => {
      const existing = db.payments.find(
        (p) => p.tenant_id === payload.tenant_id && p.period_month === payload.period_month,
      )
      if (existing) {
        db.payments = db.payments.map((p) => (p.id === existing.id ? { ...p, ...payload } : p))
      } else {
        db.payments.push({ id: uuid(), ...payload, created_at: nowISO() })
      }
      return { db, result: undefined }
    })
    return
  }
  const supabase = await getSupabase()
  const { error } = await supabase.from('payments').upsert(payload, {
    onConflict: 'tenant_id,period_month',
  })
  if (error) throw error
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
  if (error) throw error
}

export async function resetDummyData(): Promise<void> {
  if (isSupabaseConfigured) return
  resetDb()
}

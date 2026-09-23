import type { Building, Payment, Room, Tenant } from './types'
import { uuid } from './uuid'

const KEY = 'kos-tracker-db-v1'
const SESSION_KEY = 'kos-tracker-session-v1'

export type DummyDb = {
  buildings: Building[]
  rooms: Room[]
  tenants: Tenant[]
  payments: Payment[]
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthDayISO(monthOffset: number, day: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + monthOffset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return `${y}-${m}-${String(Math.min(day, last)).padStart(2, '0')}`
}

export function seedDb(): DummyDb {
  const now = new Date().toISOString()
  const bA: Building = { id: uuid(), name: 'Gedung A', created_at: now }
  const bB: Building = { id: uuid(), name: 'Gedung B', created_at: now }

  const rooms: Room[] = []
  for (const b of [bA, bB]) {
    for (let i = 1; i <= 5; i++) {
      rooms.push({
        id: uuid(),
        building_id: b.id,
        name: String(i),
        rent: 1500000,
        created_at: now,
      })
    }
  }

  const tenants: Tenant[] = [
    // A1: active, paid this month (lunas)
    {
      id: uuid(),
      room_id: rooms[0].id,
      name: 'Budi Santoso',
      phone: '081200000001',
      move_in_date: monthDayISO(-3, 5),
      rent: 1500000,
      is_active: true,
      move_out_date: null,
      created_at: now,
    },
    // A2: active, unpaid — due day 10 (may be terlambat or belum depending on today)
    {
      id: uuid(),
      room_id: rooms[1].id,
      name: 'Siti Aminah',
      phone: '081200000002',
      move_in_date: monthDayISO(-6, 10),
      rent: 1500000,
      is_active: true,
      move_out_date: null,
      created_at: now,
    },
    // A3: active, unpaid — due day 28 (usually belum when early in month)
    {
      id: uuid(),
      room_id: rooms[2].id,
      name: 'Andi Wijaya',
      phone: null,
      move_in_date: monthDayISO(-2, 28),
      rent: 1600000,
      is_active: true,
      move_out_date: null,
      created_at: now,
    },
    // B1: active, paid early this month (deadline still day 3)
    {
      id: uuid(),
      room_id: rooms[5].id,
      name: 'Dewi Lestari',
      phone: '081200000004',
      move_in_date: monthDayISO(-4, 3),
      rent: 1500000,
      is_active: true,
      move_out_date: null,
      created_at: now,
    },
    // B2: previous tenant (history), room vacant
    {
      id: uuid(),
      room_id: rooms[6].id,
      name: 'Eko Prasetyo',
      phone: null,
      move_in_date: monthDayISO(-8, 15),
      rent: 1400000,
      is_active: false,
      move_out_date: monthDayISO(-1, 20),
      created_at: now,
    },
  ]

  const payments: Payment[] = []

  // Budi paid current month (due day 5)
  const cur = monthDayISO(0, 5)
  const curMonth = `${cur.slice(0, 7)}-01`
  payments.push({
    id: uuid(),
    tenant_id: tenants[0].id,
    period_month: curMonth,
    paid_date: todayISO(),
    amount: 1500000,
    notes: 'tunai',
    created_at: now,
  })

  // Dewi paid current month early (due day 3)
  payments.push({
    id: uuid(),
    tenant_id: tenants[3].id,
    period_month: curMonth,
    paid_date: monthDayISO(0, 1),
    amount: 1500000,
    notes: 'transfer',
    created_at: now,
  })

  // Budi last month paid
  const last = monthDayISO(-1, 5)
  payments.push({
    id: uuid(),
    tenant_id: tenants[0].id,
    period_month: `${last.slice(0, 7)}-01`,
    paid_date: last,
    amount: 1500000,
    notes: null,
    created_at: now,
  })

  // Siti last month paid (but unpaid this month → terlambat if past day 10)
  const lastS = monthDayISO(-1, 8)
  payments.push({
    id: uuid(),
    tenant_id: tenants[1].id,
    period_month: `${lastS.slice(0, 7)}-01`,
    paid_date: lastS,
    amount: 1500000,
    notes: null,
    created_at: now,
  })

  return {
    buildings: [bA, bB],
    rooms,
    tenants,
    payments,
  }
}

export function loadDb(): DummyDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DummyDb
  } catch {
    // fall through to seed
  }
  const db = seedDb()
  saveDb(db)
  return db
}

export function saveDb(db: DummyDb): void {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function resetDb(): DummyDb {
  const db = seedDb()
  saveDb(db)
  return db
}

export function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

export function setSession(email: string): void {
  localStorage.setItem(SESSION_KEY, email)
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

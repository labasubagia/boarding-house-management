import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteBuilding,
  deletePayment,
  deleteRoom,
  fetchBase,
  fetchPaymentsForMonth,
  fetchPaymentsForTenant,
  insertBuilding,
  insertRoom,
  insertTenant,
  moveOutTenant,
  updateTenant,
  upsertPayment,
} from './api'
import { loadDb, resetDb, saveDb, seedDb } from './localStore'
import { computeStatus, dueDateForMonth, toLocalISO } from './dueDate'

function clearStorage() {
  localStorage.clear()
  resetDb()
}

async function seedTenantAndGetRoom() {
  const db = loadDb()
  const occupied = new Set(
    db.tenants.filter((t) => t.is_active).map((t) => t.room_id),
  )
  const room = db.rooms.find((r) => !occupied.has(r.id))
  if (!room) throw new Error('no vacant room for test')
  await insertTenant({
    room_id: room.id,
    name: 'Test Penyewa',
    phone: '081234567890',
    move_in_date: '2026-01-17',
    rent: 1500000,
  })
  const after = loadDb()
  const tenant = after.tenants.find((t) => t.name === 'Test Penyewa')
  if (!tenant) throw new Error('tenant not seeded')
  return { room, tenant }
}

beforeEach(() => {
  clearStorage()
})

describe('dummy store seed', () => {
  it('seeds 2 buildings and 10 rooms', () => {
    const db = seedDb()
    expect(db.buildings).toHaveLength(2)
    expect(db.rooms).toHaveLength(10)
    expect(db.buildings.map((b) => b.name).sort()).toEqual(['Gedung A', 'Gedung B'])
  })

  it('seeds mixed tenant statuses for demo', () => {
    const db = seedDb()
    const active = db.tenants.filter((t) => t.is_active)
    const inactive = db.tenants.filter((t) => !t.is_active)
    expect(active.length).toBeGreaterThanOrEqual(3)
    expect(inactive.length).toBeGreaterThanOrEqual(1)
  })
})

describe('business flow: record monthly payment', () => {
  it('marks tenant lunas for current period after upsert', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    const monthKey = '2026-02'
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: `${monthKey}-01`,
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: 'tunai',
    })

    const payments = await fetchPaymentsForMonth(monthKey)
    expect(payments).toHaveLength(1)
    expect(payments[0].tenant_id).toBe(tenant.id)

    const status = computeStatus({
      tenant,
      hasPayment: payments.some((p) => p.tenant_id === tenant.id),
      monthKey,
      today: new Date(2026, 1, 20),
    })
    expect(status).toBe('lunas')
  })

  it('upsert replaces same (tenant, period) instead of duplicating', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    const period = '2026-02-01'
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: period,
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: null,
    })
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: period,
      paid_date: '2026-02-11',
      amount: 1600000,
      notes: 'koreksi',
    })

    const payments = await fetchPaymentsForTenant(tenant.id)
    expect(payments).toHaveLength(1)
    expect(Number(payments[0].amount)).toBe(1600000)
    expect(payments[0].notes).toBe('koreksi')
  })

  it('early payment does not change due date next month', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    // Paid early on day 5 of Feb; move-in day 17 → March due still 17
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-05',
      amount: 1500000,
      notes: 'awal',
    })
    const marchDue = dueDateForMonth(tenant.move_in_date, '2026-03')
    expect(marchDue.getDate()).toBe(17)

    const marchPayments = await fetchPaymentsForMonth('2026-03')
    expect(marchPayments).toHaveLength(0)
    const status = computeStatus({
      tenant,
      hasPayment: false,
      monthKey: '2026-03',
      today: new Date(2026, 2, 10),
    })
    expect(status).toBe('belum')
  })

  it('deleting payment flips status away from lunas', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: null,
    })
    const list = await fetchPaymentsForTenant(tenant.id)
    expect(list).toHaveLength(1)
    await deletePayment(list[0].id)
    const after = await fetchPaymentsForTenant(tenant.id)
    expect(after).toHaveLength(0)
  })
})

describe('business flow: overdue status from due date', () => {
  it('unpaid after due day is terlambat; on/before is belum', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    // move-in day 17
    const beforeDue = computeStatus({
      tenant,
      hasPayment: false,
      monthKey: '2026-02',
      today: new Date(2026, 1, 17, 10, 0),
    })
    expect(beforeDue).toBe('belum')

    const afterDue = computeStatus({
      tenant,
      hasPayment: false,
      monthKey: '2026-02',
      today: new Date(2026, 1, 18, 10, 0),
    })
    expect(afterDue).toBe('terlambat')
  })
})

describe('business flow: tenant move-out keeps payment history', () => {
  it('marks inactive, room vacant, payments remain', async () => {
    const { room, tenant } = await seedTenantAndGetRoom()
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-01-01',
      paid_date: '2026-01-17',
      amount: 1500000,
      notes: null,
    })

    await moveOutTenant(tenant.id)

    const { tenants } = await fetchBase()
    const after = tenants.find((t) => t.id === tenant.id)
    expect(after?.is_active).toBe(false)
    expect(after?.move_out_date).toBe(toLocalISO(new Date()))

    const stillActive = tenants.find((t) => t.room_id === room.id && t.is_active)
    expect(stillActive).toBeUndefined()

    const payments = await fetchPaymentsForTenant(tenant.id)
    expect(payments).toHaveLength(1)

    const status = computeStatus({
      tenant: null,
      hasPayment: false,
      monthKey: '2026-02',
    })
    expect(status).toBe('kosong')
  })
})

describe('business flow: history by month', () => {
  it('returns only payments whose period is in the month range', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-01-01',
      paid_date: '2026-01-17',
      amount: 1500000,
      notes: null,
    })
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-10',
      amount: 1500000,
      notes: null,
    })

    const jan = await fetchPaymentsForMonth('2026-01')
    const feb = await fetchPaymentsForMonth('2026-02')
    const mar = await fetchPaymentsForMonth('2026-03')
    expect(jan).toHaveLength(1)
    expect(feb).toHaveLength(1)
    expect(mar).toHaveLength(0)
  })

  it('handles February end correctly (no leak from Jan 31)', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-01-01',
      paid_date: '2026-01-31',
      amount: 1500000,
      notes: null,
    })
    const feb = await fetchPaymentsForMonth('2026-02')
    expect(feb).toHaveLength(0)
    const jan = await fetchPaymentsForMonth('2026-01')
    expect(jan).toHaveLength(1)
  })
})

describe('CRUD cascade', () => {
  it('insert + delete building removes nested rooms/tenants/payments', async () => {
    await insertBuilding('Gedung C')
    const { buildings } = await fetchBase()
    const gedungC = buildings.find((b) => b.name === 'Gedung C')
    expect(gedungC).toBeDefined()

    await insertRoom({ building_id: gedungC!.id, name: '1', rent: 1000000 })
    const db1 = loadDb()
    const newRoom = db1.rooms.find((r) => r.building_id === gedungC!.id)
    await insertTenant({
      room_id: newRoom!.id,
      name: 'X',
      phone: null,
      move_in_date: '2026-01-01',
      rent: 1000000,
    })
    const db2 = loadDb()
    const newTenant = db2.tenants.find((t) => t.room_id === newRoom!.id)
    await upsertPayment({
      tenant_id: newTenant!.id,
      period_month: '2026-01-01',
      paid_date: '2026-01-01',
      amount: 1000000,
      notes: null,
    })

    await deleteBuilding(gedungC!.id)

    const db3 = loadDb()
    expect(db3.buildings.find((b) => b.id === gedungC!.id)).toBeUndefined()
    expect(db3.rooms.find((r) => r.id === newRoom!.id)).toBeUndefined()
    expect(db3.tenants.find((t) => t.id === newTenant!.id)).toBeUndefined()
    expect(db3.payments.find((p) => p.tenant_id === newTenant!.id)).toBeUndefined()
  })

  it('delete room removes its tenants and payments', async () => {
    const { room, tenant } = await seedTenantAndGetRoom()
    await upsertPayment({
      tenant_id: tenant.id,
      period_month: '2026-02-01',
      paid_date: '2026-02-01',
      amount: 1500000,
      notes: null,
    })
    await deleteRoom(room.id)
    const db = loadDb()
    expect(db.rooms.find((r) => r.id === room.id)).toBeUndefined()
    expect(db.tenants.find((t) => t.id === tenant.id)).toBeUndefined()
    expect(db.payments.find((p) => p.tenant_id === tenant.id)).toBeUndefined()
  })
})

describe('update tenant details', () => {
  it('updates name/phone/rent/move_in_date', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    await updateTenant(tenant.id, {
      room_id: tenant.room_id,
      name: 'Nama Baru',
      phone: null,
      move_in_date: '2026-03-05',
      rent: 1750000,
    })
    const db = loadDb()
    const updated = db.tenants.find((t) => t.id === tenant.id)
    expect(updated?.name).toBe('Nama Baru')
    expect(updated?.rent).toBe(1750000)
    expect(updated?.move_in_date).toBe('2026-03-05')
    // Due day follows new move-in day
    expect(dueDateForMonth(updated!.move_in_date, '2026-04').getDate()).toBe(5)
  })
})

describe('persistence', () => {
  it('saveDb/loadDb round-trips', () => {
    const db = seedDb()
    saveDb(db)
    const loaded = loadDb()
    expect(loaded.buildings).toHaveLength(db.buildings.length)
    expect(loaded.rooms).toHaveLength(db.rooms.length)
  })
})

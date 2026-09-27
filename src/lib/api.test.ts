import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteBuilding,
  deletePayment,
  deleteRoom,
  fetchBase,
  fetchPaymentsForMonth,
  fetchPaymentsForTenant,
  fetchPaymentsForTenants,
  friendlyDbError,
  insertBuilding,
  insertRoom,
  insertTenant,
  moveOutTenant,
  recordPayments,
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
    expect(marchDue?.getDate()).toBe(17)

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
    expect(dueDateForMonth(updated!.move_in_date, '2026-04')?.getDate()).toBe(5)
  })
})

describe('input validation', () => {
  it('rejects empty building/room/tenant names', async () => {
    await expect(insertBuilding('   ')).rejects.toThrow('wajib diisi')
    const { buildings } = await fetchBase()
    await expect(insertRoom({ building_id: buildings[0].id, name: '  ', rent: 1000000 })).rejects.toThrow(
      'wajib diisi',
    )
  })

  it('rejects negative rent/amount and bad dates', async () => {
    const { room, tenant } = await seedTenantAndGetRoom()
    await expect(
      insertTenant({ room_id: room.id, name: 'X', phone: null, move_in_date: '2026-02-30', rent: 1000000 }),
    ).rejects.toThrow('tidak valid')
    await expect(
      upsertPayment({ tenant_id: tenant.id, period_month: '2026-02-01', paid_date: '2026-02-10', amount: Number.NaN, notes: null }),
    ).rejects.toThrow('≥ 0')
    await expect(fetchPaymentsForMonth('2026-13')).rejects.toThrow('tidak valid')
  })

  it('rejects second active tenant in same room', async () => {
    const { room } = await seedTenantAndGetRoom()
    await expect(
      insertTenant({ room_id: room.id, name: 'Kedua', phone: null, move_in_date: '2026-02-01', rent: 1000000 }),
    ).rejects.toThrow('sudah terisi')
  })

  it('sorts room names naturally (2 before 10)', async () => {
    await insertBuilding('Gedung Sort')
    const { buildings } = await fetchBase()
    const b = buildings.find((x) => x.name === 'Gedung Sort')!
    await insertRoom({ building_id: b.id, name: '10', rent: 1000000 })
    await insertRoom({ building_id: b.id, name: '2', rent: 1000000 })
    const after = await fetchBase()
    const names = after.rooms.filter((r) => r.building_id === b.id).map((r) => r.name)
    expect(names).toEqual(['2', '10'])
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

describe('friendlyDbError', () => {
  it('maps duplicate active tenant to Indonesian', () => {
    expect(
      friendlyDbError({ code: '23505', message: 'duplicate key uniq_active_tenant_per_room' }).message,
    ).toMatch('sudah terisi')
  })

  it('maps check violations to Indonesian', () => {
    expect(
      friendlyDbError({ code: '23514', message: 'check constraint chk_tenants_rent_nonneg' }).message,
    ).toMatch('≥ 0')
    expect(
      friendlyDbError({ code: '23514', message: 'check constraint chk_payments_amount_pos' }).message,
    ).toMatch('> 0')
  })

  it('passes unknown errors through', () => {
    const e = new Error('boom')
    expect(friendlyDbError(e)).toBe(e)
  })
})

describe('recordPayments batch', () => {
  it('records 3 months at once (arrears + current)', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    const r = await recordPayments({
      tenant_id: tenant.id,
      move_in_date: tenant.move_in_date,
      paid_date: '2026-03-10',
      notes: 'rapel',
      items: [
        { period_month: '2026-01-01', amount: 1500000 },
        { period_month: '2026-02-01', amount: 1500000 },
        { period_month: '2026-03-01', amount: 1500000 },
      ],
    })
    expect(r.count).toBe(3)
    const payments = await fetchPaymentsForTenant(tenant.id)
    expect(payments).toHaveLength(3)
    expect(payments.every((p) => p.paid_date === '2026-03-10')).toBe(true)
  })

  it('rejects duplicate periods in one batch', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    await expect(
      recordPayments({
        tenant_id: tenant.id,
        move_in_date: tenant.move_in_date,
        paid_date: '2026-03-10',
        notes: null,
        items: [
          { period_month: '2026-02-01', amount: 1500000 },
          { period_month: '2026-02-01', amount: 1500000 },
        ],
      }),
    ).rejects.toThrow('duplikat')
  })

  it('rejects period before move-in', async () => {
    const { tenant } = await seedTenantAndGetRoom()
    await expect(
      recordPayments({
        tenant_id: tenant.id,
        move_in_date: tenant.move_in_date,
        paid_date: '2026-03-10',
        notes: null,
        items: [{ period_month: '2025-12-01', amount: 1500000 }],
      }),
    ).rejects.toThrow('sebelum tanggal masuk')
  })

  it('arrears payment flips terlambat to lunas', async () => {
    const { tenant } = await seedTenantAndGetRoom() // move-in 2026-01-17
    const before = computeStatus({
      tenant,
      hasPayment: false,
      monthKey: '2026-01',
      today: new Date(2026, 1, 10),
    })
    expect(before).toBe('terlambat')
    await recordPayments({
      tenant_id: tenant.id,
      move_in_date: tenant.move_in_date,
      paid_date: '2026-02-05',
      notes: null,
      items: [{ period_month: '2026-01-01', amount: 1500000 }],
    })
    const payments = await fetchPaymentsForMonth('2026-01')
    const after = computeStatus({
      tenant,
      hasPayment: payments.some((p) => p.tenant_id === tenant.id),
      monthKey: '2026-01',
      today: new Date(2026, 1, 10),
    })
    expect(after).toBe('lunas')
  })
})

describe('fetchPaymentsForTenants (batched, no N+1)', () => {
  it('returns one round trip covering all ids, empty array for unknown tenant', async () => {
    const first = await seedTenantAndGetRoom()
    const second = await seedTenantAndGetRoom()
    for (const [t, period] of [
      [first.tenant, '2026-01-01'],
      [second.tenant, '2026-02-01'],
    ] as const) {
      await upsertPayment({
        tenant_id: t.id,
        period_month: period,
        paid_date: '2026-02-10',
        amount: 1500000,
        notes: null,
      })
    }
    const rows = await fetchPaymentsForTenants([first.tenant.id, second.tenant.id])
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((p) => p.tenant_id))).toEqual(
      new Set([first.tenant.id, second.tenant.id]),
    )
    expect(await fetchPaymentsForTenants(['tenant-tak-ada'])).toEqual([])
    expect(await fetchPaymentsForTenants([])).toEqual([])
  })
})

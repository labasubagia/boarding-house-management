import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MonthPicker from '../components/MonthPicker'
import StatusBadge from '../components/StatusBadge'
import { useBaseData, usePaymentsForMonth } from '../hooks/useData'
import {
  computeStatus,
  dueDateForMonth,
  formatCurrency,
  formatDateID,
  occupantForMonth,
  toLocalISO,
  toMonthKey,
} from '../lib/dueDate'
import type { Room, Tenant } from '../lib/types'

export default function Dashboard() {
  const { buildings, rooms, tenants, loading, error, reload } = useBaseData()
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()))
  const { payments, error: payError } = usePaymentsForMonth(monthKey)

  const paidTenantIds = useMemo(() => new Set(payments.map((p) => p.tenant_id)), [payments])
  const roomsByBuilding = useMemo(() => {
    const m = new Map<string, Room[]>()
    for (const r of rooms) {
      const list = m.get(r.building_id) ?? []
      list.push(r)
      m.set(r.building_id, list)
    }
    return m
  }, [rooms])
  const occupantByRoom = useMemo(() => {
    const m = new Map<string, Tenant | undefined>()
    for (const r of rooms) m.set(r.id, occupantForMonth(tenants, r.id, monthKey))
    return m
  }, [rooms, tenants, monthKey])
  const totals = useMemo(() => {
    let collected = 0
    let outstanding = 0
    let overdue = 0
    for (const r of rooms) {
      const t = occupantByRoom.get(r.id)
      const status = computeStatus({ tenant: t, hasPayment: t ? paidTenantIds.has(t.id) : false, monthKey })
      if (status === 'lunas') collected += Number(payments.find((p) => p.tenant_id === t?.id)?.amount ?? 0)
      else if (status === 'terlambat') {
        overdue += 1
        outstanding += Number(t?.rent ?? 0)
      } else if (status === 'belum' && t) outstanding += Number(t.rent)
    }
    return { collected, outstanding, overdue }
  }, [rooms, occupantByRoom, paidTenantIds, payments, monthKey])
  if (loading) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) {
    return (
      <div className="text-sm text-red-600">
        <p>Gagal memuat data: {error}</p>
        <button className="underline mt-2" onClick={reload}>
          Coba lagi
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <MonthPicker value={monthKey} onChange={setMonthKey} />
        {payError && <p className="text-sm text-red-600">{payError}</p>}
        <div className="text-sm text-slate-600">
          Terkumpul <strong>{formatCurrency(totals.collected)}</strong> · Belum{' '}
          <strong>{formatCurrency(totals.outstanding)}</strong> · Terlambat {totals.overdue}
        </div>
      </div>

      {buildings.map((building) => {
        const buildingRooms = roomsByBuilding.get(building.id) ?? []
        return (
          <section key={building.id} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              {building.name}
            </h2>
            <div className="grid gap-2">
              {buildingRooms.map((room) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  monthKey={monthKey}
                  tenant={occupantByRoom.get(room.id)}
                  paid={paidTenantIds.has(occupantByRoom.get(room.id)?.id ?? '')}
                />
              ))}
              {buildingRooms.length === 0 && (
                <p className="text-sm text-slate-400">Belum ada kamar.</p>
              )}
            </div>
          </section>
        )
      })}

      {buildings.length === 0 && (
        <p className="text-sm text-slate-500">
          Belum ada data. Jalankan <code>supabase/schema.sql</code> di Supabase SQL Editor.
        </p>
      )}
    </div>
  )
}

function RoomRow({
  room,
  monthKey,
  tenant,
  paid,
}: {
  room: Room
  monthKey: string
  tenant: Tenant | undefined
  paid: boolean
}) {
  const status = computeStatus({ tenant, hasPayment: paid, monthKey })
  const due =
    tenant && status !== 'lunas' && status !== 'kosong'
      ? dueDateForMonth(tenant.move_in_date, monthKey)
      : null

  return (
    <Link
      to={`/kamar/${room.id}`}
      className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition"
    >
      <div className="min-w-0">
        <div className="font-medium truncate">
          Kamar {room.name}
          {tenant ? (
            <span className="font-normal text-slate-600"> · {tenant.name}</span>
          ) : null}
        </div>
        <div className="text-xs text-slate-500">
          {due
            ? `Jatuh tempo ${formatDateID(toLocalISO(due))}`
            : !tenant
              ? 'Tidak ada penyewa'
              : status === 'lunas'
                ? 'Sudah lunas'
                : 'Belum berlaku'}
        </div>
      </div>
      <StatusBadge status={status} />
    </Link>
  )
}

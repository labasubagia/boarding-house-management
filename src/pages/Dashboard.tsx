import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MonthPicker from '../components/MonthPicker'
import StatusBadge from '../components/StatusBadge'
import { useAllPayments, useBaseData } from '../hooks/useData'
import {
  arrearsBefore,
  dueDateForMonth,
  formatCurrency,
  formatDateID,
  occupantForMonth,
  overdueBefore,
  roomStatus,
  toLocalISO,
  toMonthKey,
} from '../lib/dueDate'
import type { Room, RoomStatus, Tenant } from '../lib/types'

export default function Dashboard() {
  const { buildings, rooms, tenants, loading, error, reload } = useBaseData()
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()))

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
  const occupants = useMemo(
    () => [...new Set(occupantByRoom.values())].filter((t) => t !== undefined),
    [occupantByRoom],
  )
  const { byTenant, error: payError } = useAllPayments(occupants.map((t) => t.id))

  const { totals, rows } = useMemo(() => {
    let collected = 0
    let outstanding = 0
    let overdueRooms = 0
    const cards: {
      room: Room
      tenant: Tenant | undefined
      paid: boolean
      arrears: string[]
      status: RoomStatus
    }[] = []
    for (const r of rooms) {
      const t = occupantByRoom.get(r.id)
      const tenantPayments = t ? (byTenant.get(t.id) ?? []) : []
      const paidKeys = new Set(tenantPayments.map((p) => p.period_month.slice(0, 7)))
      const paid = t ? paidKeys.has(monthKey) : false
      const billable = t ? arrearsBefore(t.move_in_date, paidKeys, monthKey) : []
      const overdue = t ? overdueBefore(t.move_in_date, paidKeys, monthKey, new Date()) : []
      const status = roomStatus({ tenant: t, paidKeys, monthKey })
      if (status === 'lunas' && t) {
        collected += Number(tenantPayments.find((p) => p.period_month.slice(0, 7) === monthKey)?.amount ?? 0)
      } else if (status !== 'kosong' && t) {
        outstanding += billable.length * Number(t.rent) + (paid ? 0 : Number(t.rent))
        if (status === 'terlambat') overdueRooms += 1
      }
      cards.push({ room: r, tenant: t, paid, arrears: overdue, status })
    }
    return { totals: { collected, outstanding, overdue: overdueRooms }, rows: cards }
  }, [rooms, occupantByRoom, byTenant, monthKey])
  const rowsByRoom = useMemo(() => new Map(rows.map((r) => [r.room.id, r])), [rows])
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
              {buildingRooms.map((room) => {
                const row = rowsByRoom.get(room.id)
                return (
                  <RoomRow
                    key={room.id}
                    room={room}
                    monthKey={monthKey}
                    tenant={row?.tenant}
                    status={row?.status ?? 'kosong'}
                    arrears={row?.arrears ?? []}
                  />
                )
              })}
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
  status,
  arrears,
}: {
  room: Room
  monthKey: string
  tenant: Tenant | undefined
  status: RoomStatus
  arrears: string[]
}) {
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
          {arrears.length > 0
            ? `Nunggak ${arrears.length} bulan`
            : due
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

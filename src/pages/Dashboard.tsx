import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MonthPicker from '../components/MonthPicker'
import StatusBadge from '../components/StatusBadge'
import { useBaseData, fetchPaymentsForMonth } from '../hooks/useData'
import {
  computeStatus,
  dueDateForMonth,
  formatDateID,
  toLocalISO,
  toMonthKey,
} from '../lib/dueDate'
import type { Payment, Room } from '../lib/types'

export default function Dashboard() {
  const { buildings, rooms, tenants, loading, error, reload } = useBaseData()
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()))
  const [payments, setPayments] = useState<Payment[]>([])
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPaymentsForMonth(monthKey)
      .then((data) => {
        if (!cancelled) {
          setPayments(data)
          setPayError(null)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setPayError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [monthKey])

  const activeTenants = useMemo(
    () => tenants.filter((t) => t.is_active),
    [tenants],
  )
  const paidTenantIds = useMemo(() => new Set(payments.map((p) => p.tenant_id)), [payments])

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
      </div>

      {buildings.map((building) => {
        const buildingRooms = rooms.filter((r) => r.building_id === building.id)
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
                  activeTenants={activeTenants}
                  paidTenantIds={paidTenantIds}
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
  activeTenants,
  paidTenantIds,
}: {
  room: Room
  monthKey: string
  activeTenants: ReturnType<typeof useBaseData>['tenants']
  paidTenantIds: Set<string>
}) {
  const tenant = activeTenants.find((t) => t.room_id === room.id)
  const status = computeStatus({
    tenant,
    hasPayment: tenant ? paidTenantIds.has(tenant.id) : false,
    monthKey,
  })
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

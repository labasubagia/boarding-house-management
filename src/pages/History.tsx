import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MonthPicker from '../components/MonthPicker'
import { buttonSecondary } from '../components/form'
import { useAllPayments, useBaseData, usePaymentsForMonth } from '../hooks/useData'
import { downloadCsv } from '../lib/csv'
import {
  formatCurrency,
  formatDateID,
  formatMonthID,
  occupantForMonth,
  overdueBefore,
  toMonthKey,
  unpaidThrough,
} from '../lib/dueDate'

export default function History() {
  const { buildings, rooms, tenants, loading, error } = useBaseData()
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()))
  const [tab, setTab] = useState<'lunas' | 'belum'>('lunas')
  const { payments, loading: payLoading, error: payError } = usePaymentsForMonth(monthKey)

  const tenantById = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants])
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])
  const buildingById = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings])
  const rows = useMemo(() => {
    if (payLoading) return []
    return payments.map((p) => {
      const tenant = tenantById.get(p.tenant_id)
      const room = tenant ? roomById.get(tenant.room_id) : undefined
      const building = room ? buildingById.get(room.building_id) : undefined
      return {
        payment: p,
        tenantName: tenant?.name ?? '—',
        roomName: room ? `Kamar ${room.name}` : '—',
        buildingName: building?.name ?? '—',
      }
    })
  }, [payments, tenantById, roomById, buildingById, payLoading])

  // Tenants occupying each room in the viewed month (for arrears computation).
  const occupants = useMemo(() => {
    const list = rooms
      .map((r) => occupantForMonth(tenants, r.id, monthKey))
      .filter((t) => t !== undefined)
    return [...new Map(list.map((t) => [t.id, t])).values()]
  }, [rooms, tenants, monthKey])
  const { byTenant } = useAllPayments(occupants.map((t) => t.id))

  // Unpaid periods through the viewed month (arrears + current), one row per month.
  // `nunggak` = due date passed (`overdueBefore`), not merely calendar-past:
  // viewing next month never marks not-yet-due periods as overdue.
  const dueRows = useMemo(() => {
    const now = new Date()
    return occupants.flatMap((t) => {
      const paidKeys = new Set((byTenant.get(t.id) ?? []).map((p) => p.period_month.slice(0, 7)))
      const overdue = new Set(overdueBefore(t.move_in_date, paidKeys, monthKey, now))
      return unpaidThrough(t.move_in_date, paidKeys, monthKey).map((k) => {
        const room = roomById.get(t.room_id)
        const building = room ? buildingById.get(room.building_id) : undefined
        return {
          key: `${t.id}-${k}`,
          tenant: t,
          period: k,
          isArrears: overdue.has(k),
          roomName: room ? `Kamar ${room.name}` : '—',
          roomId: room?.id ?? '',
          buildingName: building?.name ?? '—',
        }
      })
    })
  }, [occupants, byTenant, roomById, buildingById, monthKey])

  const total = payLoading ? 0 : payments.reduce((sum, p) => sum + Number(p.amount), 0)

  function exportCsv() {
    if (tab === 'belum') {
      const header = ['Gedung', 'Kamar', 'Penyewa', 'Periode', 'Status', 'Jumlah']
      const body = dueRows.map((r) => [
        r.buildingName,
        r.roomName,
        r.tenant.name,
        r.period,
        r.isArrears ? 'nunggak' : 'belum',
        Number(r.tenant.rent),
      ])
      downloadCsv(`tunggakan-${monthKey}.csv`, [header, ...body])
      return
    }
    const header = ['Gedung', 'Kamar', 'Penyewa', 'Periode', 'Tgl Bayar', 'Jumlah', 'Catatan']
    const body = rows.map((r) => [
      r.buildingName,
      r.roomName,
      r.tenantName,
      r.payment.period_month.slice(0, 7),
      r.payment.paid_date,
      Number(r.payment.amount),
      r.payment.notes ?? '',
    ])
    downloadCsv(`pembayaran-${monthKey}.csv`, [header, ...body])
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-xl font-bold self-start">Riwayat pembayaran</h1>
        <MonthPicker value={monthKey} onChange={setMonthKey} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('lunas')}
          aria-pressed={tab === 'lunas'}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${tab === 'lunas' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Lunas
        </button>
        <button
          type="button"
          onClick={() => setTab('belum')}
          aria-pressed={tab === 'belum'}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${tab === 'belum' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Belum bayar
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {payLoading ? (
            'Memuat…'
          ) : (
            <>
              {payments.length} pembayaran, {dueRows.filter((r) => r.isArrears).length} nunggak
              {tab === 'lunas' ? (
                <>
                  {' '}· Total <strong>{formatCurrency(total)}</strong>
                </>
              ) : (
                dueRows.length > 0 && (
                  <>
                    {' '}· Total <strong>{formatCurrency(dueRows.reduce((s, r) => s + Number(r.tenant.rent), 0))}</strong>
                  </>
                )
              )}
            </>
          )}
        </div>
        <button
          className={buttonSecondary}
          onClick={exportCsv}
          disabled={tab === 'lunas' ? payLoading || rows.length === 0 : dueRows.length === 0}
        >
          Export CSV
        </button>
      </div>

      {tab === 'lunas' ? (
        <>
          {payError && <p className="text-sm text-red-600">{payError}</p>}
          {payLoading ? (
            <p className="text-sm text-slate-500">Memuat…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400">Tidak ada pembayaran untuk bulan ini.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {rows.map((r) => (
                <div key={r.payment.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {r.tenantName}
                      <span className="font-normal text-slate-500">
                        {' '}
                        · {r.buildingName} · {r.roomName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatMonthID(r.payment.period_month.slice(0, 7))} · dibayar{' '}
                      {formatDateID(r.payment.paid_date)}
                      {r.payment.notes ? ` · ${r.payment.notes}` : ''}
                    </div>
                  </div>
                  <div className="font-medium whitespace-nowrap">{formatCurrency(Number(r.payment.amount))}</div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : dueRows.length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada tunggakan sampai bulan ini. Semua lunas.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {dueRows.map((r) => (
            <div key={r.key} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.tenant.name}
                  <span className="font-normal text-slate-500">
                    {' '}
                    · {r.buildingName} · {r.roomName}
                  </span>
                  {r.isArrears && <span className="ml-2 text-xs text-red-600">nunggak</span>}
                </div>
                <div className="text-xs text-slate-500">Periode {formatMonthID(r.period)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium whitespace-nowrap">{formatCurrency(Number(r.tenant.rent))}</span>
                {r.roomId && (
                  <Link to={`/kamar/${r.roomId}`} className="text-xs text-indigo-600 underline">
                    Bayar
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import MonthPicker from '../components/MonthPicker'
import { buttonSecondary } from '../components/form'
import { fetchPaymentsForMonth, useBaseData } from '../hooks/useData'
import { downloadCsv } from '../lib/csv'
import { formatDateID, formatCurrency, toMonthKey } from '../lib/dueDate'
import type { Payment } from '../lib/types'

export default function History() {
  const { buildings, rooms, tenants, loading, error } = useBaseData()
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()))
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const payLoading = loadedMonth !== monthKey

  useEffect(() => {
    let cancelled = false
    fetchPaymentsForMonth(monthKey)
      .then((data) => {
        if (cancelled) return
        setPayments(data)
        setLoadedMonth(monthKey)
        setPayError(null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setPayError(e.message)
        setLoadedMonth(monthKey)
      })
    return () => {
      cancelled = true
    }
  }, [monthKey])

  const rows = useMemo(() => {
    if (payLoading) return []
    return payments.map((p) => {
      const tenant = tenants.find((t) => t.id === p.tenant_id)
      const room = tenant ? rooms.find((r) => r.id === tenant.room_id) : undefined
      const building = room ? buildings.find((b) => b.id === room.building_id) : undefined
      return {
        payment: p,
        tenantName: tenant?.name ?? '—',
        roomName: room ? `Kamar ${room.name}` : '—',
        buildingName: building?.name ?? '—',
      }
    })
  }, [payments, tenants, rooms, buildings, payLoading])

  const total = payLoading
    ? 0
    : payments.reduce((sum, p) => sum + Number(p.amount), 0)

  function exportCsv() {
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

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {payments.length} pembayaran · Total{' '}
          <strong>{formatCurrency(total)}</strong>
        </div>
        <button className={buttonSecondary} onClick={exportCsv} disabled={payLoading || payments.length === 0}>
          Export CSV
        </button>
      </div>

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
                  {formatDateID(r.payment.paid_date)}
                  {r.payment.notes ? ` · ${r.payment.notes}` : ''}
                </div>
              </div>
              <div className="font-medium whitespace-nowrap">{formatCurrency(Number(r.payment.amount))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

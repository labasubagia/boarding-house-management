import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import {
  Field,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from '../components/form'
import { fetchPaymentsForTenant, useBaseData } from '../hooks/useData'
import {
  computeStatus,
  dueDateForMonth,
  formatDateID,
  formatCurrency,
  formatMonthID,
  toLocalISO,
  toMonthKey,
} from '../lib/dueDate'
import { deletePayment, insertTenant, moveOutTenant, updateTenant, upsertPayment } from '../lib/api'
import type { Payment, Tenant } from '../lib/types'

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { buildings, rooms, tenants, loading, error, reload } = useBaseData()
  const [payments, setPayments] = useState<Payment[]>([])
  const [showPay, setShowPay] = useState(false)
  const [showTenant, setShowTenant] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const room = rooms.find((r) => r.id === roomId)
  const building = room ? buildings.find((b) => b.id === room.building_id) : null
  const activeTenant = tenants.find((t) => t.room_id === roomId && t.is_active)
  const pastTenants = tenants
    .filter((t) => t.room_id === roomId && !t.is_active)
    .sort((a, b) => b.move_in_date.localeCompare(a.move_in_date))

  const tenantId = activeTenant?.id ?? null

  useEffect(() => {
    let cancelled = false
    if (!tenantId) {
      setPayments([])
      return
    }
    fetchPaymentsForTenant(tenantId)
      .then((data) => {
        if (!cancelled) setPayments(data)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  if (loading) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!room) return <p className="text-sm text-slate-500">Kamar tidak ditemukan.</p>

  const monthKey = toMonthKey(new Date())
  const paidThisMonth =
    activeTenant && payments.some((p) => p.period_month.startsWith(monthKey))
  const status = computeStatus({
    tenant: activeTenant,
    hasPayment: Boolean(paidThisMonth),
    monthKey,
  })
  const due = activeTenant ? dueDateForMonth(activeTenant.move_in_date, monthKey) : null

  async function refreshPayments() {
    if (!tenantId) return
    try {
      setPayments(await fetchPaymentsForTenant(tenantId))
      setErr(null)
    } catch (fetchErr) {
      setErr((fetchErr as Error).message)
    }
  }

  async function moveOut() {
    if (!activeTenant) return
    if (!confirm(`Tandai ${activeTenant.name} keluar hari ini? Riwayat pembayaran tetap tersimpan.`))
      return
    try {
      await moveOutTenant(activeTenant.id)
      await reload()
      setErr(null)
      setMsg('Penyewa dipindahkan keluar.')
    } catch (e) {
      setMsg(null)
      setErr((e as Error).message)
    }
  }

  async function removePayment(id: string) {
    if (!confirm('Hapus catatan pembayaran ini?')) return
    try {
      await deletePayment(id)
      await refreshPayments()
      setErr(null)
      setMsg('Pembayaran dihapus.')
    } catch (e) {
      setMsg(null)
      setErr((e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link to="/" className="text-xs text-indigo-600 underline">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">
            {building?.name} · Kamar {room.name}
          </h1>
        </div>
        <StatusBadge status={status} />
      </div>

      {msg && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}
      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Penyewa aktif
        </h2>
        {activeTenant ? (
          <>
            <div>
              <div className="font-semibold">{activeTenant.name}</div>
              {activeTenant.phone && (
                <div className="text-sm text-slate-500">{activeTenant.phone}</div>
              )}
              <div className="text-sm text-slate-600 mt-1">
                Masuk: {formatDateID(activeTenant.move_in_date)}
              </div>
              <div className="text-sm text-slate-600">
                Sewa: {formatCurrency(Number(activeTenant.rent))}/bulan
              </div>
              {due && (
                <div className="text-sm text-slate-600">
                  Jatuh tempo bulan ini: <strong>{formatDateID(toLocalISO(due))}</strong>
                  <span className="text-slate-400"> (tetap, bayar awal tidak mengubah tanggal)</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonPrimary}
                onClick={() => setShowPay(true)}
                disabled={Boolean(paidThisMonth)}
              >
                {paidThisMonth ? 'Sudah lunas bulan ini' : 'Catat bayar'}
              </button>
              <button
                className={buttonSecondary}
                onClick={() => {
                  setEditingTenant(activeTenant)
                  setShowTenant(true)
                }}
              >
                Ubah
              </button>
              <button className={buttonDanger} onClick={moveOut}>
                Keluar
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Kamar kosong.</p>
            <button
              className={buttonPrimary}
              onClick={() => {
                setEditingTenant(null)
                setShowTenant(true)
              }}
            >
              Tambah penyewa
            </button>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Riwayat pembayaran{activeTenant ? ` — ${activeTenant.name}` : ''}
        </h2>
        {activeTenant ? (
          payments.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada pembayaran tercatat.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-medium">{formatMonthID(p.period_month.slice(0, 7))}</div>
                    <div className="text-slate-500 text-xs">
                      Dibayar {formatDateID(p.paid_date)}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
                    <button
                      className="text-xs underline text-slate-400 hover:text-red-600"
                      onClick={() => removePayment(p.id)}
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-slate-400">Tidak ada penyewa aktif.</p>
        )}
      </section>

      {pastTenants.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Penyewa sebelumnya
          </h2>
          <ul className="text-sm text-slate-600 space-y-1">
            {pastTenants.map((t) => (
              <li key={t.id}>
                {t.name} · {formatDateID(t.move_in_date)} –{' '}
                {t.move_out_date ? formatDateID(t.move_out_date) : '—'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showPay && activeTenant && (
        <PaymentModal
          tenant={activeTenant}
          monthKey={monthKey}
          defaultAmount={Number(activeTenant.rent)}
          onClose={() => setShowPay(false)}
          onSaved={async () => {
            setShowPay(false)
            await refreshPayments()
            setMsg('Pembayaran tersimpan.')
          }}
        />
      )}

      {showTenant && (
        <TenantModal
          roomId={room.id}
          defaultRent={Number(room.rent)}
          tenant={editingTenant}
          onClose={() => setShowTenant(false)}
          onSaved={async () => {
            setShowTenant(false)
            await reload()
            await refreshPayments()
            setErr(null)
            setMsg(editingTenant ? 'Penyewa diperbarui.' : 'Penyewa ditambahkan.')
          }}
        />
      )}

      <div className="pt-2">
        <button className="text-xs text-slate-400 underline" onClick={() => navigate('/')}>
          Tutup
        </button>
      </div>
    </div>
  )
}

function PaymentModal({
  tenant,
  monthKey,
  defaultAmount,
  onClose,
  onSaved,
}: {
  tenant: Tenant
  monthKey: string
  defaultAmount: number
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [paidDate, setPaidDate] = useState(toLocalISO(new Date()))
  const [amount, setAmount] = useState(String(defaultAmount))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await upsertPayment({
        tenant_id: tenant.id,
        period_month: `${monthKey}-01`,
        paid_date: paidDate,
        amount: Number(amount),
        notes: notes.trim() || null,
      })
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Catat pembayaran" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="text-sm text-slate-500 mb-3">
          Periode: <strong>{formatMonthID(monthKey)}</strong> · {tenant.name}
        </p>
        <Field label="Tanggal bayar">
          <input
            type="date"
            required
            className={inputClass}
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </Field>
        <Field label="Jumlah (Rp)">
          <input
            type="number"
            required
            min="0"
            step="1000"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Catatan (opsional)">
          <input
            type="text"
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="transfer / tunai"
          />
        </Field>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={buttonPrimary}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Batal
          </button>
        </div>
      </form>
    </Modal>
  )
}

function TenantModal({
  roomId,
  defaultRent,
  tenant,
  onClose,
  onSaved,
}: {
  roomId: string
  defaultRent: number
  tenant: Tenant | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState(tenant?.name ?? '')
  const [phone, setPhone] = useState(tenant?.phone ?? '')
  const [moveIn, setMoveIn] = useState(tenant?.move_in_date ?? toLocalISO(new Date()))
  const [rent, setRent] = useState(String(tenant ? Number(tenant.rent) : defaultRent))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      room_id: roomId,
      name: name.trim(),
      phone: phone.trim() || null,
      move_in_date: moveIn,
      rent: Number(rent),
    }
    try {
      if (tenant) {
        await updateTenant(tenant.id, payload)
      } else {
        await insertTenant(payload)
      }
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={tenant ? 'Ubah penyewa' : 'Tambah penyewa'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nama">
          <input
            type="text"
            required
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="No. HP (opsional)">
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label={tenant ? 'Tanggal masuk' : 'Tanggal masuk (awal sewa)'}>
          <input
            type="date"
            required
            className={inputClass}
            value={moveIn}
            onChange={(e) => setMoveIn(e.target.value)}
          />
        </Field>
        {!tenant && (
          <p className="text-xs text-slate-500 -mt-1 mb-3">
            Tanggal jatuh tempo tiap bulan mengikuti tanggal masuk ini (bayar lebih awal tidak
            mengubahnya).
          </p>
        )}
        <Field label="Sewa per bulan (Rp)">
          <input
            type="number"
            required
            min="0"
            step="1000"
            className={inputClass}
            value={rent}
            onChange={(e) => setRent(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={buttonPrimary}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Batal
          </button>
        </div>
      </form>
    </Modal>
  )
}

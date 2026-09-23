import { useState } from 'react'
import Modal from '../components/Modal'
import { Field, buttonPrimary, buttonSecondary, inputClass } from '../components/form'
import { formatCurrency } from '../lib/dueDate'
import {
  deleteBuilding,
  deleteRoom,
  insertBuilding,
  insertRoom,
  updateRoom,
} from '../lib/api'
import { useBaseData } from '../hooks/useData'

export default function ManageRooms() {
  const { buildings, rooms, loading, error, reload } = useBaseData()
  const [showBuilding, setShowBuilding] = useState(false)
  const [editRoom, setEditRoom] = useState<{
    id?: string
    building_id: string
    name: string
    rent: number
  } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (loading) return <p className="text-sm text-slate-500">Memuat…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  async function removeRoom(id: string) {
    if (!confirm('Hapus kamar ini? Semua penyewa & pembayaran terkait ikut terhapus.')) return
    try {
      await deleteRoom(id)
      await reload()
      setErr(null)
      setMsg('Kamar dihapus.')
    } catch (e) {
      setMsg(null)
      setErr((e as Error).message)
    }
  }

  async function removeBuilding(id: string) {
    if (!confirm('Hapus gedung ini? Semua kamar di dalamnya ikut terhapus.')) return
    try {
      await deleteBuilding(id)
      await reload()
      setErr(null)
      setMsg('Gedung dihapus.')
    } catch (e) {
      setMsg(null)
      setErr((e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Kelola kamar</h1>
        <button className={buttonPrimary} onClick={() => setShowBuilding(true)}>
          + Gedung
        </button>
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

      {buildings.map((building) => {
        const list = rooms.filter((r) => r.building_id === building.id)
        return (
          <section
            key={building.id}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{building.name}</h2>
              <div className="flex gap-2">
                <button
                  className="text-xs underline text-slate-500"
                  onClick={() => {
                    setEditRoom({ building_id: building.id, name: '', rent: 1500000 })
                  }}
                >
                  + Kamar
                </button>
                <button
                  className="text-xs underline text-red-500"
                  onClick={() => removeBuilding(building.id)}
                >
                  Hapus
                </button>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {list.map((room) => (
                <li
                  key={room.id}
                  className="py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <span className="font-medium">Kamar {room.name}</span>
                    <span className="text-slate-500"> · {formatCurrency(Number(room.rent))}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs underline text-slate-500"
                      onClick={() =>
                        setEditRoom({
                          id: room.id,
                          building_id: room.building_id,
                          name: room.name,
                          rent: Number(room.rent),
                        })
                      }
                    >
                      Ubah
                    </button>
                    <button
                      className="text-xs underline text-red-500"
                      onClick={() => removeRoom(room.id)}
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
              {list.length === 0 && (
                <li className="py-2 text-sm text-slate-400">Belum ada kamar.</li>
              )}
            </ul>
          </section>
        )
      })}

      {buildings.length === 0 && (
        <p className="text-sm text-slate-500">Belum ada gedung. Tambah gedung dulu.</p>
      )}

      {showBuilding && (
        <BuildingModal
          onClose={() => setShowBuilding(false)}
          onSaved={async () => {
            setShowBuilding(false)
            await reload()
            setErr(null)
            setMsg('Gedung ditambahkan.')
          }}
        />
      )}

      {editRoom && (
        <RoomModal
          initial={editRoom}
          onClose={() => setEditRoom(null)}
          onSaved={async (isEdit) => {
            setEditRoom(null)
            await reload()
            setErr(null)
            setMsg(isEdit ? 'Kamar diperbarui.' : 'Kamar ditambahkan.')
          }}
        />
      )}
    </div>
  )
}

function BuildingModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await insertBuilding(name)
      await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Tambah gedung" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nama gedung">
          <input
            type="text"
            required
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gedung C"
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

function RoomModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: { id?: string; building_id: string; name: string; rent: number }
  onClose: () => void
  onSaved: (isEdit: boolean) => void | Promise<void>
}) {
  const [name, setName] = useState(initial.name)
  const [rent, setRent] = useState(String(initial.rent))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      building_id: initial.building_id,
      name: name.trim(),
      rent: Number(rent),
    }
    try {
      if (initial.id) {
        await updateRoom(initial.id, payload)
      } else {
        await insertRoom(payload)
      }
      await onSaved(Boolean(initial.id))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial.id ? 'Ubah kamar' : 'Tambah kamar'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nama kamar">
          <input
            type="text"
            required
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="6"
          />
        </Field>
        <Field label="Sewa default / bulan (Rp)">
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

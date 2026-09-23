# Business rules

Aturan inti aplikasi Kos Tracker. Implementasi: `src/lib/dueDate.ts`, `src/lib/api.ts`.

## 1. Jatuh tempo sewa (deadline)

| Aturan | Detail |
| --- | --- |
| Sumber tanggal | `tenants.move_in_date` (tanggal masuk / pembayaran pertama) |
| Pola | Hari yang sama **setiap bulan** (mis. masuk 17 Jan → jatuh tempo 17 Feb, 17 Mar, …) |
| Bayar lebih awal | **Tidak** menggeser jatuh tempo bulan berikutnya |
| Bulan pendek | Di-clamp ke hari terakhir bulan (31 Jan → 28 Feb / 29 Feb leap year) |
| Sebelum bulan masuk | Bukan jatuh tempo; status bulan itu **`belum`** (bukan `terlambat`) |

```
dueDate = min(day(move_in_date), lastDayOfMonth(month))
// null / belum jika month < bulan masuk
```

## 2. Status kamar (per bulan yang dipilih)

| Status | Syarat |
| --- | --- |
| `kosong` | Tidak ada penyewa aktif di kamar |
| `lunas` | Ada baris `payments` untuk `(tenant_id, period_month)` bulan itu |
| `belum` | Ada penyewa, belum bayar, dan (**hari ini ≤ jatuh tempo** ATAU bulan sebelum `move_in_date`) |
| `terlambat` | Ada penyewa, belum bayar, **hari ini > akhir hari jatuh tempo**, dan bulan ≥ bulan masuk |

Prioritas: `kosong` → `lunas` → `terlambat` / `belum`.

Pada hari jatuh tempo sendiri status masih **belum** (jadi sempat bayar di hari H tanpa dianggap telat).

## 3. Pembayaran

| Aturan | Detail |
| --- | --- |
| Unique per periode | Satu baris per `(tenant_id, period_month)` — upsert menimpa, tidak dobel |
| `period_month` | Selalu tanggal 1 bulan berikutnya (`YYYY-MM-01`) |
| `paid_date` | Tanggal uang diterima (boleh lebih awal dari jatuh tempo) |
| Hapus | Mengembalikan status bulan itu ke `belum` / `terlambat` |

## 4. Penyewa

| Aksi | Efek |
| --- | --- |
| Tambah | `is_active = true`, tanggal masuk menentukan jatuh tempo |
| Ubah | Nama, HP, tanggal masuk, sewa (jatuh tempo mengikuti tanggal baru) |
| Keluar | `is_active = false`, `move_out_date = hari ini`; **riwayat pembayaran tetap ada** |
| Kamar setelah keluar | `kosong` sampai penyewa baru ditambahkan |

## 5. Gedung & kamar

- Seed default: 2 gedung × 5 kamar, sewa Rp 1.500.000 (bisa diubah).
- Hapus gedung/kamar: cascade hapus penyewa + pembayaran terkait (ada confirm dialog).

## 6. Riwayat & CSV

- Filter per bulan: `period_month` antara hari-1 … hari-akhir bulan tersebut.
- Export CSV kolom: Gedung, Kamar, Penyewa, Periode, Tgl Bayar, Jumlah, Catatan.

## Contoh skenario (diuji di test)

1. Masuk **17 Jan 2026** → jatuh tempo **17 Feb 2026**.
2. Bayar **5 Feb 2026** (awal) → status Feb **lunas**; jatuh tempo Mar tetap **17 Mar**.
3. **18 Feb** belum bayar → status **terlambat**.
4. Keluar tenant → kamar **kosong**, data bayar historis tetap ada.

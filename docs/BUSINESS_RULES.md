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
| `kosong` | Tidak ada penghuni untuk bulan itu (kamar kosong, atau penyewa baru masuk bulan berikutnya) |
| `lunas` | Bulan itu dibayar DAN tidak ada tunggakan bulan sebelumnya |
| `belum` | Ada penyewa, belum bayar, dan (**hari ini ≤ jatuh tempo** ATAU bulan sebelum `move_in_date`) |
| `terlambat` | Belum bayar bulan ini DAN/ATAU masih ada bulan lalu yang belum dibayar |

Prioritas: `kosong` → (`terlambat` bila ada tunggakan lewat jatuh tempo, walau bulan ini lunas) → `lunas` → `terlambat` / `belum`.

Pada hari jatuh tempo sendiri status masih **belum** (jadi sempat bayar di hari H tanpa dianggap telat).

Tunggakan tidak pernah sembunyi di balik "lunas bulan ini": bayar bulan berjalan tapi bulan lalu
masih kosong → badge tetap **Terlambat** + label `Nunggak N bulan` di Dashboard dan tombol kamar.
`nunggak` = jatuh tempo periode itu sudah lewat (`overdueBefore()` / `isOverduePeriod()` di `src/lib/dueDate.ts`),
bukan sekadar kalender lewat: lihat bulan depan tidak menandai bulan ini `nunggak` sebelum tanggal jatuh temponya.

## 3. Pembayaran (bisa multi-bulan sekaligus)

| Aturan | Detail |
| --- | --- |
| Unique per periode | Satu baris per `(tenant_id, period_month)` — upsert menimpa, tidak dobel |
| `period_month` | Selalu tanggal 1 bulan itu (`YYYY-MM-01`) |
| Batch | `recordPayments()` catat N bulan sekaligus (tunggakan + kini + muka), satu `paid_date`/catatan bersama |
| Validasi batch | Tolak pilihan kosong, periode dobel dalam batch, periode sebelum bulan masuk |
| `paid_date` | Tanggal uang diterima (boleh lebih awal dari jatuh tempo) |
| Hapus | Mengembalikan status bulan itu ke `belum` / `terlambat` |
| Jendela tagih | `unpaidPeriods()`: bulan masuk s/d bulan kini + 2 bulan muka; yang sudah lunas disembunyikan dari checklist |

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

- Tab `Lunas`: filter per bulan via `period_month` (hari-1 … hari-akhir bulan itu); kolom CSV: Gedung, Kamar, Penyewa, Periode, Tgl Bayar, Jumlah, Catatan.
- Tab `Belum bayar`: semua periode belum dibayar s/d bulan dipilih (tunggakan + bulan ini, label `nunggak` hanya bila jatuh tempo periode itu sudah lewat), tiap baris ada tautan `Bayar` ke kamar; CSV: Gedung, Kamar, Penyewa, Periode, Status, Jumlah.
- Ringkasan lintas tab: kedua tab tampilkan `{N} pembayaran, {M} nunggak` (+ Total sesuai tab) agar tak perlu cek manual per tab.
- Dashboard sadar tunggakan: status kamar + total Belum/Terlambat hitung dari semua pembayaran tenant (bukan cuma bulan tampil); label `Nunggak N bulan`.

## Contoh skenario (diuji di test)

1. Masuk **17 Jan 2026** → jatuh tempo **17 Feb 2026**.
2. Bayar **5 Feb 2026** (awal) → status Feb **lunas**; jatuh tempo Mar tetap **17 Mar**.
3. **18 Feb** belum bayar → status **terlambat**.
4. Keluar tenant → kamar **kosong**, data bayar historis tetap ada.
5. Bayar Mar tapi Jan–Feb kosong → Mar tetap **terlambat** + `Nunggak 2 bulan` (tunggakan override `lunas bulan ini`).
6. Masuk 1 Jan, bayar Jan+Feb+Mar sekaligus → `recordPayments` 3 baris, satu `paid_date` bersama.
## 7. Batasan database

App validasi dulu (`src/lib/api.ts`: `reqName`, `reqMoney`, `reqDate`), DB jadi jaring pengaman
(`supabase/schema.sql` + `supabase/migrations/20260927000000_constraints.sql`):

| Batasan | Aturan |
| --- | --- |
| `UNIQUE(buildings.name)` | Nama gedung tidak dobel |
| `UNIQUE(building_id, name)` rooms | Nama kamar unik per gedung |
| `UNIQUE(room_id) WHERE is_active` | Satu penyewa aktif per kamar |
| `CHECK (rent >= 0)` rooms/tenants | Sewa tidak negatif |
| `CHECK (amount > 0)` payments | Nominal bayar positif |
| `CHECK (btrim(name) <> '')` | Nama tidak kosong |
| `updated_at` + trigger | Otomatis terisi saat update |

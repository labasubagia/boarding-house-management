# Kos Tracker — Manajemen Pembayaran Kos

Web app pribadi untuk mencatat pembayaran bulanan penyewa kos (2 gedung, ±10 kamar).

**Docs:** [Business rules](docs/BUSINESS_RULES.md) · [Development](docs/DEVELOPMENT.md) · [Deployment / Supabase](docs/DEPLOYMENT.md)

## Mode dummy (default)

Tanpa `.env` Supabase, app jalan **fully local (localStorage)** — cocok uji business flow dulu:

- Login: email + password **apa saja**
- Seed contoh: 2 gedung, 10 kamar, status lunas / belum / terlambat / kosong
- Badge **Dummy** di header
- Reset: DevTools → `localStorage.removeItem('kos-tracker-db-v1')` (session: `kos-tracker-session-v1`)

Beralih ke Supabase: isi `.env` (lihat `.env.example`) — guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Fitur

- Login email + password
- Dashboard per bulan: **Lunas / Belum bayar / Terlambat / Kosong**
- Jatuh tempo = tanggal masuk tiap bulan; bayar awal **tidak** geser deadline; bulan pendek di-clamp
- Catat / hapus pembayaran (unik per bulan)
- Kelola gedung, kamar, penyewa (keluar — riwayat tetap)
- Riwayat per bulan + **export CSV**

Aturan lengkap: [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md).

## Stack

- Vite + React + TypeScript + Tailwind CSS (HashRouter → GitHub Pages)
- Lint/format: **oxlint** · Test: **Vitest** (+ happy-dom)
- Backend: **dummy localStorage** atau **Supabase** (free tier)
- Deploy: GitHub Actions → Pages · Keep-alive harian (anti pause 7 hari)

## Quick start

```bash
npm install
npm run dev       # mode dummy
```

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + build produksi |
| `npm run lint` | oxlint |
| `npm run format` | oxlint auto-fix (lint + style fixes) |
| `npm run test` | Vitest (business flow tests) |
| `npm run test:watch` | Vitest watch |
| `npm run check` | typecheck + lint + test + build |
| `npm run preview` | Preview `dist/` |

## Tests

```bash
npm run test
```

| File | Cakupan |
| --- | --- |
| `src/lib/dueDate.test.ts` | Jatuh tempo, clamp Jan→Feb, status Lunas/Belum/Terlambat/Kosong |
| `src/lib/api.test.ts` | Catat bayar, upsert unik, telat, keluar + riwayat, CRUD cascade, riwayat bulanan |
| `src/lib/csv.test.ts` | Escape CSV export |
| `src/lib/auth.test.ts` | Login dummy, session, logout |

## Struktur singkat

```
docs/               BUSINESS_RULES · DEVELOPMENT · DEPLOYMENT
supabase/schema.sql Skema + RLS + seed
src/lib/            dueDate (inti aturan) · api · auth · localStore · csv
src/pages/          Login · Dashboard · RoomDetail · ManageRooms · History
.github/workflows/  deploy.yml · keep-alive.yml
```

## Setup Supabase (opsional)

1. SQL Editor → `supabase/schema.sql`
2. Auth → Users → Add user (sign-up publik off)
3. `.env` dari `.env.example`
4. GitHub secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
5. Pages → Source = GitHub Actions
6. Aktifkan workflow **Supabase keep-alive**

Detail: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

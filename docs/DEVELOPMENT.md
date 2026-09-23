# Development guide

## Prerequisites

- Node.js 22+ (atau 20 LTS)
- npm

## Setup

```bash
npm install
npm run dev
```

Tanpa `.env`, aplikasi berjalan dalam **mode dummy** (localStorage + seed contoh).

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Dev server (Vite) |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run typecheck` | `tsc -b` saja |
| `npm run lint` | **oxlint** lint `src/` |
| `npm run lint:fix` / `npm run format` | oxlint auto-fix (format + lint fixes) |
| `npm run test` | Vitest run sekali (CI) |
| `npm run test:watch` | Vitest watch mode |
| `npm run check` | typecheck + lint + test + build |
| `npm run preview` | Preview build lokal |

## Lint & format (oxlint)

Konfigurasi: [`.oxlintrc.json`](../.oxlintrc.json)

- Plugin: React, TypeScript, oxc
- Kategori: `correctness` = error; `suspicious` / `style` = warn
- Auto-fix: `npm run format` (setara `oxlint src --fix`)

oxlint menangani lint **dan** perbaikan style otomatis yang tersedia — tidak perlu Prettier/Biome di project ini.

## Tests (Vitest)

Konfigurasi di `vite.config.ts`:

- Environment: `happy-dom` (localStorage tersedia untuk mode dummy)
- Pattern: `src/**/*.test.ts`

| File | Cakupan |
| --- | --- |
| `src/lib/dueDate.test.ts` | Aturan jatuh tempo, clamp bulan, status kamar |
| `src/lib/api.test.ts` | Alur bayar, telat, pindah keluar, riwayat, CRUD cascade |
| `src/lib/csv.test.ts` | Escape CSV |
| `src/lib/auth.test.ts` | Login dummy, session, logout |

Jalankan: `npm run test`

Dokumentasi aturan bisnis: [BUSINESS_RULES.md](./BUSINESS_RULES.md).

## Struktur project

```
docs/                  Dokumentasi
supabase/schema.sql    Skema DB + RLS + seed (untuk mode Supabase)
src/
  components/          Layout, UI kecil
  hooks/               useAuth, useData
  lib/
    api.ts             Akses data (dummy | Supabase)
    auth.ts            Login/logout (dummy | Supabase)
    dueDate.ts         Logika jatuh tempo & status  ← inti business flow
    localStore.ts      Penyimpanan localStorage + seed
    supabase.ts        Deteksi mode / lazy client
    csv.ts             Export CSV
  pages/               Login, Dashboard, RoomDetail, ManageRooms, History
.github/workflows/     Deploy Pages + keep-alive Supabase
```

## Mode data

| Mode | Kapan aktif | Penyimpanan |
| --- | --- | --- |
| Dummy | Tanpa env / `VITE_DUMMY=1` | `localStorage` key `kos-tracker-db-v1` |
| Supabase | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` terisi | Postgres via Supabase |

Reset dummy: DevTools → `localStorage.clear()` lalu reload.

## Conventions

- Tanggal disimpan `YYYY-MM-DD` string lokal; jangan pakai `toISOString()` untuk tanggal murni (geser timezone) — gunakan `toLocalISO()`.
- Bahasa UI: Bahasa Indonesia.
- Perubahan aturan jatuh/temp/status → update `dueDate.ts` + test di `dueDate.test.ts` + `docs/BUSINESS_RULES.md`.

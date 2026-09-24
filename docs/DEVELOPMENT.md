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
| `npm run test` | Vitest run sekali (CI) — selalu dummy mode (abaikan `.env`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest + coverage |
| `npm run test:e2e` | Playwright E2E dummy mode (auto start/stop dev server via `webServer`) |
| `npm run test:e2e:ui` | Playwright UI mode (dummy) |
| `npm run test:e2e:supabase` | Playwright E2E mode Supabase — butuh `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` di shell/CI (lihat bawah) |
| `npm run test:secrets` | **gitleaks** full-history secret scan |
| `npm run check` | typecheck + lint + test + build |
| `npm run preview` | Preview build lokal |

## Lint & format (oxlint)

Konfigurasi: [`.oxlintrc.json`](../.oxlintrc.json)

- Plugin: React, TypeScript, oxc
- Kategori: `correctness` = error; `suspicious` / `style` = warn
- Auto-fix: `npm run format` (setara `oxlint src --fix`)

oxlint menangani lint **dan** perbaikan style otomatis yang tersedia — tidak perlu Prettier/Biome di project ini.

## Secret scanning (gitleaks)

**Prasyarat:** [`gitleaks`](https://github.com/gitleaks/gitleaks#install) di `PATH` (wajib — pre-commit gagal jika tidak ada).

| Trigger | Perintah | Cakupan |
| --- | --- | --- |
| `git commit` (Husky pre-commit) | `gitleaks protect --staged` | File yang di-`git add` saja |
| Manual / CI | `npm run test:secrets` | Full git history |

Config: [`.gitleaks.toml`](../.gitleaks.toml) (extend default rules).

**Jangan commit:** `.env` (sudah di-gitignore), API keys, password asli → pakai `.env` lokal + **GitHub Secrets**.

False positive: tambah fingerprint ke [`.gitleaksignore`](../.gitleaksignore) (opsional, belum dibuat).

Urutan pre-commit: **gitleaks → lint-staged → vitest**.

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

## E2E (Playwright Test)

Config: [`playwright.config.ts`](../playwright.config.ts) — webServer start `npm run dev` otomatis, port **5174**, `reuseExistingServer: false`.

**Mode dummy (default, lokal):** `npm run test:e2e` memaksa `VITE_DUMMY=1` dan mengosongkan env Supabase — tidak pernah menyentuh project production.

**Mode Supabase (CI):** `npm run test:e2e:supabase` aktif hanya jika **shell/CI** mengekspor `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (file `.env` lokal diabaikan Playwright — aman dari salah kena production). CI memakai stack self-hosted via CLI:

1. `supabase/setup-cli` + `supabase start` (Docker di runner GitHub)
2. Migrasi + seed dari [`supabase/migrations/`](../supabase/migrations/) (mirror `supabase/schema.sql`)
3. Buat user test via GoTrue admin API (`E2E_EMAIL` / `E2E_PASSWORD`)
4. Jalankan `npm run test:e2e:supabase`

Workflow: [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml). Unit test juga dummy via `vite.config.ts` `test.env`.

Test: [`e2e/smoke.spec.ts`](../e2e/smoke.spec.ts) — login → dashboard → bayar → kelola kamar → riwayat/CSV → logout. Deteksi mode via banner "Mode dummy".

**Prasyarat (sekali):** `npx playwright install chromium`

**Jalankan:**

```bash
npm run test:e2e
```

**Env (opsional):**

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://127.0.0.1:5174` | baseURL |
| `E2E_PORT` | `5174` | Port webServer E2E |
| `E2E_EMAIL` | `test@test.test` | Email login |
| `E2E_PASSWORD` | `test123` | Password login |
| `VITE_SUPABASE_URL` | — | URL Supabase (hanya dari shell/CI → mode Supabase) |
| `VITE_SUPABASE_ANON_KEY` | — | Anon key (hanya dari shell/CI → mode Supabase) |

Report/artifact: `playwright-report/`, `e2e/output/` (di-gitignore).

## Struktur project

```
docs/                  Dokumentasi
e2e/smoke.spec.ts      Playwright E2E smoke (npm run test:e2e)
playwright.config.ts   Playwright config + webServer
supabase/
  config.toml          Konfigurasi stack lokal (supabase start)
  migrations/          Migrasi + seed (dipakai CI/local CLI)
  schema.sql           Skema DB + RLS + seed (paste ke SQL Editor prod)
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
.github/workflows/     Deploy Pages + keep-alive + E2E (Supabase lokal di CI)
```

## Mode data

| Mode | Kapan aktif | Penyimpanan |
| --- | --- | --- |
| Dummy | Tanpa env / `VITE_DUMMY=1` | `localStorage` key `kos-tracker-db-v1` |
| Supabase | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` terisi | Postgres via Supabase |

Reset dummy: DevTools → `localStorage.clear()` lalu reload.

**Satu environment (free tier):** Supabase hosted = production only. Unit test & E2E lokal **selalu dummy** (di-paksa di config) — jangan arahkan test ke project production agar data tidak tabrak. E2E CI memakai **stack Supabase self-hosted di runner** (terisolasi, data tiap job bersih). Dev harian: jalankan tanpa `.env` (atau `VITE_DUMMY=1`) kecuali sengaja mengetes API.

## Conventions

- Tanggal disimpan `YYYY-MM-DD` string lokal; jangan pakai `toISOString()` untuk tanggal murni (geser timezone) — gunakan `toLocalISO()`.
- Bahasa UI: Bahasa Indonesia.
- Perubahan aturan jatuh/temp/status → update `dueDate.ts` + test di `dueDate.test.ts` + `docs/BUSINESS_RULES.md`.

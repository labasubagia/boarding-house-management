# Deployment & Supabase setup

Panduan beralih dari mode dummy ke Supabase free tier + GitHub Pages.

## 1. Supabase (sekali)

1. Buat project gratis di [supabase.com](https://supabase.com).
2. **SQL Editor** → seluruh isi [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
3. **Authentication → Users → Add user** → email + password untuk Anda / orang tua.
   - Public sign-up tetap **off** (default).
   - Opsional: matikan email confirmation agar login langsung bisa.
4. **Project Settings → API** salin:
   - `Project URL`
   - `anon public` key

## 2. Environment variables

Copy `.env.example` → `.env` (lokal, gitignored):

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Tanpa env → mode dummy. Dengan env (tanpa `VITE_DUMMY=1`) → mode Supabase.

## 3. GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret** (×2):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon key |

## 4. GitHub Pages

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. Push ke `main` / `master` → workflow **Deploy to GitHub Pages** jalan otomatis.
3. URL: `https://<user>.github.io/<repo>/` (HashRouter: `#/`, `#/riwayat`, …)

### Workflow deploy

`.github/workflows/deploy.yml`:

- `npm ci` → `npm run build` (env dari secrets) → upload `dist` → deploy Pages
- disarankan tambah `npm run test` sebelum build di CI

### Workflow keep-alive (anti pause)

`.github/workflows/keep-alive.yml`:

- Cron harian `0 12 * * *` UTC → `GET /rest/v1/buildings?select=id&limit=1`
- Mencegah Supabase free **pause setelah 7 hari inaktif**
- Aktifkan setelah deploy pertama: **Actions → Supabase keep-alive → Enable workflow**

Jika project tetap pause: Supabase Dashboard → **Resume** (data aman, ≤ 1 tahun).

## 5. Verifikasi pasca deploy

- [ ] Login dengan akun Supabase (bukan dummy — tidak ada badge Dummy)
- [ ] Seed 2 gedung / 10 kamar tampil dari DB
- [ ] Catat bayar → refresh → masih ada
- [ ] Export CSV jalan
- [ ] keep-alive workflow merah/hijau di Actions

## 6. Satu environment (free tier) — anti tabrak data

Satu project Supabase = **production only**.

| Aktivitas | Mode | Sentuh Supabase? |
| --- | --- | --- |
| Unit test / `npm run check` | dummy (paksa di config) | Tidak |
| `npm run test:e2e` | dummy (paksa di Playwright) | Tidak |
| Dev harian | dummy (tanpa `.env` / `VITE_DUMMY=1`) | Tidak |
| GitHub Pages | Supabase (via Actions secrets) | Ya — satu-satunya writer |

Jangan jalankan dev/E2E dengan `.env` Supabase aktif — akan menulis ke data produksi (tabrakan).

### Bersihkan pollution E2E (sekali)

Jika pernah E2E kena Supabase (mis. row `e2e-cash` / `Tenant Uji E2E`), SQL Editor:

```sql
delete from tenants where name = 'Tenant Uji E2E';
delete from rooms where name = '99';
delete from buildings where name ilike 'Gedung E2E%';
-- sisa payment yatim (jika ada)
delete from payments where notes = 'e2e-cash';
```

## Backup

- Riwayat → **Export CSV** per bulan
- Supabase Table Editor → export tabel `payments`, `tenants`, dll.
- Free tier: **tanpa backup otomatis** — export berkala disarankan

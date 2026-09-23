import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output')

const USER_EMAIL = process.env.E2E_EMAIL || 'test@test.test'
const USER_PASS = process.env.E2E_PASSWORD || 'test123'

test.describe('Kos Tracker smoke', () => {
  test('full business flow', async ({ page, baseURL }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // 1. Login screen (domcontentloaded — networkidle never settles with Vite HMR WS)
    await page.goto('/#/login', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 })
    expect(page.url()).toContain('login')

    const dummyNotice = await page.locator('text=Mode dummy').count()
    const isDummyMode = dummyNotice > 0
    console.log(`INFO | mode=${isDummyMode ? 'dummy' : 'supabase'}`)

    // 2. Login
    await page.fill('input[type="email"]', USER_EMAIL)
    await page.fill('input[type="password"]', USER_PASS)
    await page.click('button[type="submit"]')

    await expect(page.locator('nav a:has-text("Dashboard")')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('h2:has-text("Gedung A")')).toBeVisible({ timeout: 30_000 })

    if (isDummyMode) {
      await expect(page.locator('header span:text-is("Dummy")')).toHaveCount(1)
    } else {
      await expect(page.locator('header span:text-is("Dummy")')).toHaveCount(0)
    }
    await expect(page.locator(`footer span:text-is("${USER_EMAIL}")`)).toHaveCount(1)

    // 3. Dashboard seed
    await expect(page.locator('h2:has-text("Gedung B")')).toHaveCount(1)

    const lunas = await page.locator('span:text-is("Lunas")').count()
    const belum = await page.locator('span:text-is("Belum bayar")').count()
    const terlambat = await page.locator('span:text-is("Terlambat")').count()
    const kosong = await page.locator('span:text-is("Kosong")').count()
    expect(lunas + belum + terlambat + kosong).toBeGreaterThanOrEqual(5)

    // 4. Month nav
    const monthLabel = page.locator('main .min-w-40')
    const before = ((await monthLabel.textContent()) || '').trim()
    await page.click('[aria-label="Bulan sebelumnya"]')
    await expect(monthLabel).not.toHaveText(before)
    await page.click('[aria-label="Bulan berikutnya"]')
    await expect(monthLabel).toHaveText(before)

    // 5. Vacant room → tenant → payment → move out
    const vacantLink = page.locator('main a', { hasText: 'Tidak ada penyewa' }).first()
    if ((await vacantLink.count()) > 0) {
      await vacantLink.click()
    } else {
      await page.locator('main a[href*="#/kamar/"]').first().click()
    }
    await expect(page.locator('main h1')).toBeVisible()

    const hasEmptyRoom = (await page.locator('text=Kamar kosong').count()) > 0
    if (hasEmptyRoom) {
      await page.click('main button:has-text("Tambah penyewa")')
      await expect(page.locator('h2:text-is("Tambah penyewa")')).toBeVisible()
      await page.locator('form input[type="text"]').first().fill('Tenant Uji E2E')
      await page.fill('input[type="tel"]', '089999999999')
      await page.locator('form button[type="submit"]:has-text("Simpan")').click()
      await expect(page.locator('text=Penyewa ditambahkan')).toBeVisible()
      await expect(page.locator('text=Tenant Uji E2E').first()).toBeVisible()
    }

    const payBtn = page.locator('main button:has-text("Catat bayar")')
    if ((await payBtn.count()) > 0) {
      await payBtn.click()
      await expect(page.locator('h2:text-is("Catat pembayaran")')).toBeVisible()
      await page.fill('input[type="text"][placeholder="transfer / tunai"]', 'e2e-cash')
      await page.locator('form button[type="submit"]:has-text("Simpan")').click()
      await expect(page.locator('text=Pembayaran tersimpan')).toBeVisible()
      await expect(page.locator('span:text-is("Lunas")').first()).toBeVisible()
      await expect(page.locator('button:has-text("Sudah lunas bulan ini")')).toBeVisible()
      await expect(page.locator('text=e2e-cash')).toBeVisible()
    }

    const moveOutBtn = page.locator('main section button:text-is("Keluar")')
    if ((await moveOutBtn.count()) > 0) {
      page.once('dialog', (d) => d.accept())
      await moveOutBtn.click()
      await expect(page.locator('text=Penyewa dipindahkan keluar')).toBeVisible()
      await expect(page.locator('text=Kamar kosong')).toBeVisible()
      await expect(page.locator('h2:has-text("Penyewa sebelumnya")')).toBeVisible()
    }

    // 6. Manage rooms
    await page.click('nav a:has-text("Kamar")')
    await expect(page.locator('h1:has-text("Kelola kamar")')).toBeVisible()

    const bName = `Gedung E2E ${Date.now()}`
    await page.click('main button:has-text("+ Gedung")')
    await expect(page.locator('h2:text-is("Tambah gedung")')).toBeVisible()
    await page.fill('form input[type="text"]', bName)
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Gedung ditambahkan')).toBeVisible()

    const e2eBuilding = page.locator('main section', { hasText: bName }).first()
    await e2eBuilding.locator('button:has-text("+ Kamar")').click()
    await expect(page.locator('h2:text-is("Tambah kamar")')).toBeVisible()
    await page.fill('form input[type="text"]', '99')
    await page.locator('form input[type="number"]').first().fill('2000000')
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Kamar ditambahkan')).toBeVisible()

    await e2eBuilding.locator('li:has-text("Kamar 99") button:has-text("Ubah")').click()
    await expect(page.locator('h2:text-is("Ubah kamar")')).toBeVisible()
    await page.locator('form input[type="number"]').first().fill('2100000')
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Kamar diperbarui')).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await e2eBuilding.locator('li:has-text("Kamar 99") button:text-is("Hapus")').click()
    await expect(page.locator('text=Kamar dihapus')).toBeVisible()
    await expect(page.locator('li:has-text("Kamar 99")')).toHaveCount(0)

    page.once('dialog', (d) => d.accept())
    const buildingHapus = e2eBuilding.locator('div:has(> h2) button:text-is("Hapus")').first()
    if ((await buildingHapus.count()) > 0) {
      await buildingHapus.click()
    } else {
      await e2eBuilding.locator('button:text-is("Hapus")').first().click()
    }
    await expect(page.locator(`text=${bName}`)).toHaveCount(0, { timeout: 10_000 })

    // 7. History + CSV
    await page.click('nav a:has-text("Riwayat")')
    await expect(page.locator('h1:has-text("Riwayat pembayaran")')).toBeVisible()
    await expect(page.locator('text=/\\d+ pembayaran|Tidak ada pembayaran/')).toBeVisible()

    const countText = ((await page.locator('main').textContent()) || '').trim()
    if (/\d+ pembayaran/.test(countText)) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('main button:has-text("Export CSV")'),
      ])
      expect(download.suggestedFilename()).toMatch(/\.csv$/)
    }

    // 8. Logout / re-login / reload
    await page.locator('footer button:text-is("Keluar")').click()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page).toHaveURL(/login/)

    await page.fill('input[type="email"]', USER_EMAIL)
    await page.fill('input[type="password"]', USER_PASS)
    await page.click('button[type="submit"]')
    await expect(page.locator('h2:has-text("Gedung A")')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('h2:has-text("Gedung A")')).toBeVisible()

    // Screenshots
    await page.screenshot({ path: path.join(OUT_DIR, 'dashboard.png'), fullPage: true })
    await page.goto('/#/riwayat', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1:has-text("Riwayat pembayaran")')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'history.png'), fullPage: true })

    expect(consoleErrors, `JS errors: ${consoleErrors.slice(0, 5).join(' | ')}`).toHaveLength(0)
    expect(baseURL).toBeTruthy()
  })
})

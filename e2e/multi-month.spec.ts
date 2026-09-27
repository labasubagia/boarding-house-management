import { expect, test } from '@playwright/test'

const USER_EMAIL = process.env.E2E_EMAIL || 'test@test.test'
const USER_PASS = process.env.E2E_PASSWORD || 'test123'

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('Multi-month payments (dummy)', () => {
  test('arrears + advance in one save', async ({ page }) => {
    // Login
    await page.goto('/#/login', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 })
    await page.fill('input[type="email"]', USER_EMAIL)
    await page.fill('input[type="password"]', USER_PASS)
    await page.click('button[type="submit"]')
    await expect(page.locator('nav a:has-text("Dashboard")')).toBeVisible({ timeout: 30_000 })

    // Own building + room for determinism
    const bName = `Gedung Multi ${Date.now()}`
    await page.click('nav a:has-text("Kamar")')
    await expect(page.locator('h1:has-text("Kelola kamar")')).toBeVisible()
    await page.click('main button:has-text("+ Gedung")')
    await page.fill('form input[type="text"]', bName)
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Gedung ditambahkan')).toBeVisible()
    const e2eBuilding = page.locator('main section', { hasText: bName }).first()
    await e2eBuilding.locator('button:has-text("+ Kamar")').click()
    await page.fill('form input[type="text"]', 'M1')
    await page.locator('form input[type="number"]').first().fill('1000000')
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Kamar ditambahkan')).toBeVisible()

    // Room detail → tenant with move-in 2 months ago (creates 2 arrears)
    await page.click('nav a:has-text("Dashboard")')
    await page.locator('main a', { hasText: 'Kamar M1' }).click()
    await expect(page.locator('main h1')).toBeVisible()
    const moveIn = new Date()
    moveIn.setDate(1)
    moveIn.setMonth(moveIn.getMonth() - 2)
    await page.click('main button:has-text("Tambah penyewa")')
    await page.locator('form input[type="text"]').first().fill('Tenant Multi E2E')
    await page.locator('form input[type="date"]').fill(iso(moveIn))
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Penyewa ditambahkan')).toBeVisible()

    // Arrears badge on button
    await expect(page.locator('main button:has-text("Catat bayar · nunggak 2")')).toBeVisible()

    // Modal: 5 periods (2 arrears + current + 2 advance), 3 checked by default
    await page.click('main button:has-text("Catat bayar")')
    await expect(page.locator('h2:text-is("Catat pembayaran")')).toBeVisible()
    const boxes = page.locator('form input[type="checkbox"]')
    await expect(boxes).toHaveCount(5)
    await expect(page.locator('form label', { hasText: 'nunggak' })).toHaveCount(2)
    await expect(page.locator('form label', { hasText: 'muka' })).toHaveCount(2)

    // Include 1 advance month → 4 months total
    await page.locator('form label', { hasText: 'muka' }).first().locator('input[type="checkbox"]').check()
    await page.fill('input[type="text"][placeholder="transfer / tunai"]', 'e2e-multi')
    await page.locator('form button[type="submit"]').click()
    await expect(page.locator('text=Lunas 4 bulan')).toBeVisible()

    // 4 payment rows share the same paid date + notes
    await expect(page.locator('main li', { hasText: 'e2e-multi' })).toHaveCount(4)

    // Reopen: paid months gone from checklist, arrears badge cleared
    await page.click('main button:has-text("Catat bayar")')
    await expect(page.locator('form input[type="checkbox"]')).toHaveCount(1)
    await page.locator('form button:has-text("Batal")').click()
  })
})

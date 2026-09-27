import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const USER_EMAIL = process.env.E2E_EMAIL || 'test@test.test'
const USER_PASS = process.env.E2E_PASSWORD || 'test123'

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('Multi-month payments', () => {
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
    // Dashboard hides nothing: Terlambat + Nunggak 2 bulan on the room card
    await page.click('nav a:has-text("Dashboard")')
    const card = page.locator('main a', { hasText: 'Kamar M1' }).first()
    await expect(card).toContainText('Terlambat')
    await expect(card).toContainText('Nunggak 2 bulan')

    // Second room + tenant (move-in today, no arrears) so Dashboard loads 2 occupants
    await page.click('nav a:has-text("Kamar")')
    await expect(page.locator('h1:has-text("Kelola kamar")')).toBeVisible()
    const building2 = page.locator('main section', { hasText: bName }).first()
    await building2.locator('button:has-text("+ Kamar")').click()
    await page.fill('form input[type="text"]', 'M2')
    await page.locator('form input[type="number"]').first().fill('1000000')
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Kamar ditambahkan')).toBeVisible()
    await page.click('nav a:has-text("Dashboard")')
    await page.locator('main a', { hasText: 'Kamar M2' }).click()
    await expect(page.locator('main h1')).toBeVisible()
    await page.click('main button:has-text("Tambah penyewa")')
    await page.locator('form input[type="text"]').first().fill('Tenant Kedua E2E')
    await page.locator('form button[type="submit"]:has-text("Simpan")').click()
    await expect(page.locator('text=Penyewa ditambahkan')).toBeVisible()

    // N+1 lock: Dashboard with 2 occupants fires one batched payments request.
    // Dummy mode makes zero network calls (localStorage) → vacuous pass there;
    // Supabase mode must show a single `tenant_id=in.` query (dedup identical
    // URLs: StrictMode double-effect may repeat it in dev).
    const payReqs: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/payments')) payReqs.push(r.url())
    })
    await page.click('nav a:has-text("Dashboard")')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('main a', { hasText: 'Kamar M1' }).first()).toBeVisible()
    const tenantReqs = payReqs.filter((u) => u.includes('tenant_id'))
    if (tenantReqs.length > 0) {
      expect(new Set(tenantReqs).size).toBe(1)
      for (const u of tenantReqs) expect(u).toContain('tenant_id=in.')
    }

    // History Belum bayar tab: 2 arrears + current month, 2 nunggak labels
    await page.click('nav a:has-text("Riwayat")')
    await expect(page.locator('h1:has-text("Riwayat pembayaran")')).toBeVisible()
    await page.locator('main button', { hasText: 'Belum bayar' }).click()
    const ownDue = page.locator('main div.bg-white > div', { hasText: 'Tenant Multi E2E' })
    await expect(ownDue).toHaveCount(3)
    await expect(ownDue.locator('span:text-is("nunggak")')).toHaveCount(2)
    // Combined summary visible on the Belum bayar tab
    await expect(page.locator('text=/\\d+ pembayaran, \\d+ nunggak/').first()).toBeVisible()

    // Arrears CSV has real body, not just a download event
    const [dueDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('main button:has-text("Export CSV")'),
    ])
    expect(dueDownload.suggestedFilename()).toMatch(/\.csv$/)
    const duePath = await dueDownload.path()
    expect(duePath).toBeTruthy()
    const dueCsv = await readFile(duePath!, 'utf8')
    expect(dueCsv).toContain('Gedung,Kamar,Penyewa,Periode,Status,Jumlah')
    expect(dueCsv).toContain('Tenant Multi E2E')
    expect(dueCsv).toContain('nunggak')

    // Future month: own rows grow (unpaidThrough) but next month is not-yet-due.
    // Ascending periods → last own row is next month → zero nunggak label there.
    await page.click('[aria-label="Bulan berikutnya"]')
    await expect(ownDue).toHaveCount(4)
    await expect(ownDue.nth(3).locator('span:text-is("nunggak")')).toHaveCount(0)
    await page.click('[aria-label="Bulan sebelumnya"]')
    await expect(ownDue).toHaveCount(3)

    // Back to room detail
    await page.click('nav a:has-text("Dashboard")')
    await page.locator('main a', { hasText: 'Kamar M1' }).click()
    await expect(page.locator('main h1')).toBeVisible()
    // Modal: 5 periods (2 arrears + current + 2 advance), 3 checked by default
    await page.click('main button:has-text("Catat bayar")')
    await expect(page.locator('h2:text-is("Catat pembayaran")')).toBeVisible()
    const boxes = page.locator('form input[type="checkbox"]')
    await expect(boxes).toHaveCount(5)
    await expect(page.locator('form label', { hasText: 'nunggak' })).toHaveCount(2)
    await expect(page.locator('form label', { hasText: 'muka' })).toHaveCount(2)

    // Empty selection disables submit (validation path reachable from UI)
    const all = await boxes.all()
    for (const b of all) await b.uncheck()
    await expect(page.locator('form button[type="submit"]')).toBeDisabled()
    // Include 1 advance month → 4 months total
    for (const b of [all[0], all[1], all[2], all[3]]) await b.check()
    await page.fill('input[type="text"][placeholder="transfer / tunai"]', 'e2e-multi')
    await page.locator('form button[type="submit"]').click()
    await expect(page.locator('text=Lunas 4 bulan')).toBeVisible()

    // 4 payment rows share the same paid date + notes
    await expect(page.locator('main li', { hasText: 'e2e-multi' })).toHaveCount(4)

    // Reopen: paid months gone from checklist, arrears badge cleared
    await page.click('main button:has-text("Catat bayar")')
    await expect(page.locator('form input[type="checkbox"]')).toHaveCount(1)
    await page.locator('form button:has-text("Batal")').click()

    // Dashboard flips to Lunas once arrears are covered
    await page.click('nav a:has-text("Dashboard")')
    await expect(page.locator('main a', { hasText: 'Kamar M1' }).first()).toContainText('Lunas')

    // History: own tenant cleared from Belum bayar, summary stays on both tabs
    await page.click('nav a:has-text("Riwayat")')
    await page.locator('main button', { hasText: 'Belum bayar' }).click()
    await expect(page.locator('main div.bg-white > div', { hasText: 'Tenant Multi E2E' })).toHaveCount(0)
    await expect(page.locator('text=/\\d+ pembayaran, \\d+ nunggak/').first()).toBeVisible()
    await page.locator('main button', { hasText: 'Lunas' }).first().click()
    await expect(
      page.locator('main div.bg-white > div', { hasText: 'Tenant Multi E2E' }),
    ).toHaveCount(1)
    await expect(page.locator('text=/\\d+ pembayaran, \\d+ nunggak/').first()).toBeVisible()

    // Paid CSV lists the 4 e2e-multi rows
    const [paidDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('main button:has-text("Export CSV")'),
    ])
    expect(paidDownload.suggestedFilename()).toMatch(/\.csv$/)
    const paidPath = await paidDownload.path()
    expect(paidPath).toBeTruthy()
    const paidCsv = await readFile(paidPath!, 'utf8')
    expect(paidCsv).toContain('Gedung,Kamar,Penyewa,Periode,Tgl Bayar,Jumlah,Catatan')
    expect(paidCsv).toContain('Tenant Multi E2E')
    expect(paidCsv).toContain('e2e-multi')
  })
})

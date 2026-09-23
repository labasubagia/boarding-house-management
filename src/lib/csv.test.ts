import { describe, expect, it } from 'vitest'

/** Pure CSV cell formatting used by downloadCsv (extracted for testability). */
function formatCsvCell(cell: string | number): string {
  const s = String(cell ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(formatCsvCell).join(',')).join('\n')
}

describe('CSV export', () => {
  it('joins cells with commas and rows with newlines', () => {
    const csv = toCsv([
      ['Gedung', 'Kamar'],
      ['Gedung A', '1'],
    ])
    expect(csv).toBe('Gedung,Kamar\nGedung A,1')
  })

  it('quotes cells containing commas', () => {
    expect(formatCsvCell('Budi, Santoso')).toBe('"Budi, Santoso"')
  })

  it('escapes double quotes', () => {
    expect(formatCsvCell('Bayar "tunai"')).toBe('"Bayar ""tunai"""')
  })

  it('quotes cells containing newlines', () => {
    expect(formatCsvCell('baris1\nbaris2')).toBe('"baris1\nbaris2"')
  })

  it('keeps plain values unquoted', () => {
    expect(formatCsvCell(1500000)).toBe('1500000')
    expect(formatCsvCell('transfer')).toBe('transfer')
  })
})

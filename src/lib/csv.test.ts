import { describe, expect, it } from 'vitest'
import { formatCsvCell } from './csv'


describe('CSV export', () => {
  it('joins cells with commas and rows with newlines', () => {
    const rows = [
      ['Gedung', 'Kamar'],
      ['Gedung A', '1'],
    ]
    expect(rows.map((row) => row.map(formatCsvCell).join(',')).join('\n')).toBe(
      'Gedung,Kamar\nGedung A,1',
    )
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

  it('prefixes formula cells to block spreadsheet injection', () => {
    expect(formatCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)")
    expect(formatCsvCell('+1500000')).toBe("'+1500000")
    expect(formatCsvCell('@user')).toBe("'@user")
  })
})

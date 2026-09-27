import { describe, expect, it, vi } from 'vitest'
import { downloadCsv, formatCsvCell } from './csv'


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

describe('downloadCsv', () => {
  it('builds blob CSV, triggers anchor download, revokes URL', async () => {
    const created: Blob[] = []
    const revoked: string[] = []
    const clicked: HTMLAnchorElement[] = []
    vi.stubGlobal('URL', {
      createObjectURL: (b: Blob) => {
        created.push(b)
        return 'blob:mock'
      },
      revokeObjectURL: (u: string) => {
        revoked.push(u)
      },
    })
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((
      tag: string,
    ) => {
      const el = origCreate(tag as 'a') as HTMLAnchorElement
      if (tag === 'a') {
        el.click = () => {
          clicked.push(el)
        }
      }
      return el
    }) as unknown as typeof document.createElement)
    downloadCsv('bayar.csv', [
      ['Gedung', 'Kamar'],
      ['Gedung A', 1],
    ])
    expect(created).toHaveLength(1)
    expect(await created[0].text()).toContain('Gedung,Kamar')
    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('bayar.csv')
    expect(clicked[0].href).toContain('blob:mock')
    expect(revoked).toEqual(['blob:mock'])
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})


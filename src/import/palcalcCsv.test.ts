import { describe, expect, it } from 'vitest'
import { gameData } from '../engine/gameData'
import { parseCsv, readPalCalcCsv } from './palcalcCsv'

const pal = (name: string) => gameData.pals.find((p) => p.name === name)!.id
const skill = (name: string) => gameData.passives.find((p) => p.name === name)!.id

// shaped like PalCalc's PalCSVExporter output: every value quoted, blanks empty,
// extra passive/attack columns with blank headers
function palcalcCsv(sep: string, rows: string[][]): string {
  const header = ['Pal', 'Gender', 'Level', 'Owner', 'Location', 'Map Coords', 'HP', 'ATK', 'DEF', 'Passive Skills', '', '', '', 'Attack Skills', '', '']
  const line = (cells: string[]) => cells.map((c) => (c === '' ? '' : `"${c.replace(/"/g, '""')}"`)).join(sep)
  return [header.join(sep), ...rows.map(line)].join('\r\n')
}

const row = (name: string, gender: string, owner: string, passives: string[], location = 'Palbox, tab 1 at (1,1)', level = '30') => [
  name,
  gender,
  level,
  owner,
  location,
  '',
  '70',
  '55',
  '12',
  ...[...passives, '', '', '', ''].slice(0, 4),
  'Spirit Fire',
  'Flare Arrow',
  '',
]

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, separators inside quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n1,,3\r\n', ',')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['1', '', '3'],
    ])
  })
})

describe('readPalCalcCsv', () => {
  const sample = [
    row('Anubis', 'Male', 'Owned by Nico', ['Swift', 'Legend']),
    row('Lamball', 'Female', 'Owned by Mira', ['Artisan', 'Workaholic', 'Brittle']),
    row('Relaxaurus Lux', 'Female', 'Owned by Our Guild', [], 'A base, slot (2,3)'),
    row("Katress Ignis", 'Male', '', ["World Tree's Bounty"]),
  ]

  for (const [label, sep] of [
    ['commas', ','],
    ['semicolons', ';'],
  ] as const) {
    it(`reads a PalCalc export separated by ${label}`, () => {
      const r = readPalCalcCsv(palcalcCsv(sep, sample))
      expect(r.skipped).toBe(0)
      expect(r.pals).toHaveLength(4)
      const [anubis, lamball, lux, katress] = r.pals
      expect(anubis).toMatchObject({ palId: pal('Anubis'), gender: 'M', owner: 'Nico', level: 30, passives: [skill('Swift'), skill('Legend')] })
      expect(lamball.passives).toEqual([skill('Artisan'), skill('Workaholic'), skill('Brittle')])
      expect(lux).toMatchObject({ palId: pal('Relaxaurus Lux'), gender: 'F', owner: 'Our Guild', passives: [], location: 'A base, slot (2,3)' })
      expect(katress).toMatchObject({ palId: pal('Katress Ignis'), owner: '', passives: [skill("World Tree's Bounty")] })
      expect(r.owners).toEqual(
        new Map([
          ['Nico', 1],
          ['Mira', 1],
          ['Our Guild', 1],
          ['', 1],
        ]),
      )
    })
  }

  it('strips a byte order mark', () => {
    expect(readPalCalcCsv('﻿' + palcalcCsv(',', sample)).pals).toHaveLength(4)
  })

  it('skips unknown species and reports them', () => {
    const r = readPalCalcCsv(palcalcCsv(',', [row('Notapal', 'Male', 'Owned by Nico', []), row('Anubis', 'Male', 'Owned by Nico', [])]))
    expect(r.pals).toHaveLength(1)
    expect(r.skipped).toBe(1)
    expect(r.unknownSpecies.get('Notapal')).toBe(1)
  })

  it('keeps unknown passives by name so they still count as passives', () => {
    const r = readPalCalcCsv(palcalcCsv(',', [row('Anubis', 'Male', 'Owned by Nico', ['Swift', 'Some New Passive'])]))
    expect(r.pals[0].passives).toEqual([skill('Swift'), 'Some New Passive'])
    expect(r.unknownPassives.get('Some New Passive')).toBe(1)
  })

  it('skips rows without a readable gender', () => {
    const r = readPalCalcCsv(palcalcCsv(',', [row('Anubis', 'Any Gender', 'Owned by Nico', [])]))
    expect(r.pals).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('rejects files that are not a PalCalc export', () => {
    expect(() => readPalCalcCsv('name,age\nbob,3')).toThrow(/PalCalc/)
    expect(() => readPalCalcCsv('')).toThrow(/empty/)
  })
})

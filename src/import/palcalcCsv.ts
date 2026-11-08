import { gameData, type Gender } from '../engine/gameData'
import { MAX_PASSIVES } from '../engine/passives'

/**
 * Reads the "Export Save CSV" file from PalCalc (https://github.com/tylercamp/palcalc).
 *
 * Columns (English UI): Pal, Gender, Level, Owner, Location, Map Coords, HP,
 * ATK, DEF, Passive Skills (one column per passive, extra headers blank),
 * Attack Skills (same). PalCalc separates with the Windows list separator, so
 * this can be "," or ";", and quotes every non-empty value.
 */

export interface ImportedPal {
  palId: string
  gender: Gender
  /** Known passive ids, plus raw names for passives not in the game data. */
  passives: string[]
  /** Owner as written by PalCalc, without "Owned by"; "" when unknown. */
  owner: string
  level?: number
  location: string
}

export interface PalCalcImport {
  pals: ImportedPal[]
  /** Pal names that matched no species, with how many rows had them. */
  unknownSpecies: Map<string, number>
  /** Passive names not in the game data; kept on the pals as-is. */
  unknownPassives: Map<string, number>
  /** Rows dropped (unknown species or unreadable gender). */
  skipped: number
  owners: Map<string, number>
}

/** Splits CSV text into rows of cells, handling quotes and "" escapes. */
export function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === separator) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** The separator used in the header line: whichever of , ; or tab appears most outside quotes. */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const c of firstLine) {
    if (c === '"') quoted = !quoted
    else if (!quoted && c in counts) counts[c]++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

let palByName: Map<string, string> | undefined
let passiveByName: Map<string, string> | undefined
function lookups() {
  if (!palByName || !passiveByName) {
    palByName = new Map()
    // some names appear twice in the data; the first is the main species
    for (const p of gameData.pals) if (!palByName.has(key(p.name))) palByName.set(key(p.name), p.id)
    passiveByName = new Map(gameData.passives.map((p) => [key(p.name), p.id]))
  }
  return { palByName, passiveByName }
}

function genderOf(value: string): Gender | undefined {
  const v = value.trim().toLowerCase()
  if (v === 'male' || v === 'm' || v === '♂') return 'M'
  if (v === 'female' || v === 'f' || v === '♀') return 'F'
  return undefined
}

function bump(map: Map<string, number>, k: string) {
  map.set(k, (map.get(k) ?? 0) + 1)
}

export function readPalCalcCsv(text: string): PalCalcImport {
  const clean = text.replace(/^﻿/, '')
  const rows = parseCsv(clean, detectSeparator(clean))
  if (rows.length === 0) throw new Error('The file is empty.')

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const palCol = col('pal')
  const genderCol = col('gender')
  if (palCol < 0 || genderCol < 0) {
    throw new Error('This does not look like a PalCalc "Export Save CSV" file (no Pal and Gender columns). Is PalCalc set to English?')
  }
  const ownerCol = col('owner')
  const levelCol = col('level')
  const locationCol = col('location')
  // passives fill the "Passive Skills" column and the blank-headed columns after it
  const passiveStart = col('passive skills')
  let passiveEnd = passiveStart
  if (passiveStart >= 0) {
    passiveEnd = passiveStart + 1
    while (passiveEnd < header.length && header[passiveEnd] === '') passiveEnd++
  }

  const { palByName, passiveByName } = lookups()
  const result: PalCalcImport = { pals: [], unknownSpecies: new Map(), unknownPassives: new Map(), skipped: 0, owners: new Map() }

  for (const row of rows.slice(1)) {
    const cell = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')
    const name = cell(palCol)
    const palId = palByName.get(key(name))
    const gender = genderOf(cell(genderCol))
    if (!palId) {
      if (name) bump(result.unknownSpecies, name)
      result.skipped++
      continue
    }
    if (!gender) {
      result.skipped++
      continue
    }

    const passives: string[] = []
    for (let i = passiveStart; i >= 0 && i < passiveEnd; i++) {
      const raw = cell(i)
      if (!raw) continue
      const id = passiveByName.get(key(raw))
      if (!id) bump(result.unknownPassives, raw)
      const value = id ?? raw
      if (!passives.includes(value) && passives.length < MAX_PASSIVES) passives.push(value)
    }

    const owner = cell(ownerCol).replace(/^owned by\s+/i, '')
    bump(result.owners, owner)
    const level = parseInt(cell(levelCol), 10)
    result.pals.push({
      palId,
      gender,
      passives,
      owner,
      level: Number.isFinite(level) ? level : undefined,
      location: cell(locationCol),
    })
  }
  return result
}

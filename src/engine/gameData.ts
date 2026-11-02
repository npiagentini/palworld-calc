import raw from '../data/game-data.json'

export type Gender = 'M' | 'F'

export interface PalSpecies {
  id: string
  name: string
  dex: number
  variant: boolean
  power: number
  maleChance: number
  guaranteedPassives: string[]
  /** [min, max] level it spawns at in the wild; null if it never does. */
  wildLevels: [number, number] | null
  /** Game rarity; LEGENDARY_RARITY and up are legendaries. */
  rarity: number
}

export const LEGENDARY_RARITY = 20

export interface PassiveSkill {
  id: string
  name: string
  rank: number
  description: string
  randomAllowed: boolean
}

interface GenderSpecificEntry {
  a: number
  aGender: Gender
  b: number
  bGender: Gender
  child: number
}

export interface GameData {
  source: { repo: string; ref: string; dbVersion: string; builtAt: string }
  mechanics: {
    inheritCount: Record<string, number>
    randomCount: Record<string, number>
  }
  pals: PalSpecies[]
  passives: PassiveSkill[]
  children: number[]
  genderSpecific: GenderSpecificEntry[]
}

export const gameData = raw as GameData

const palIndexById = new Map(gameData.pals.map((p, i) => [p.id, i]))
const passiveById = new Map(gameData.passives.map((p) => [p.id, p]))
const n = gameData.pals.length

function pairIndex(i: number, j: number): number {
  if (i > j) [i, j] = [j, i]
  return i * n - (i * (i - 1)) / 2 + (j - i)
}

function indexOf(palId: string): number {
  const i = palIndexById.get(palId)
  if (i === undefined) throw new Error(`Unknown pal: ${palId}`)
  return i
}

export function palIndexOf(palId: string): number {
  return indexOf(palId)
}

/** Index-based breed() for hot loops. */
export function breedByIndex(ia: number, ib: number, aGender: Gender, bGender: Gender): number {
  for (const g of gameData.genderSpecific) {
    if (g.a === ia && g.b === ib && g.aGender === aGender && g.bGender === bGender) return g.child
    if (g.a === ib && g.b === ia && g.aGender === bGender && g.bGender === aGender) return g.child
  }
  return gameData.children[pairIndex(ia, ib)]
}

export function getPal(palId: string): PalSpecies {
  return gameData.pals[indexOf(palId)]
}

export function getPassive(passiveId: string): PassiveSkill | undefined {
  return passiveById.get(passiveId)
}

export function isGenderSpecificPair(a: string, b: string): boolean {
  const ia = indexOf(a)
  const ib = indexOf(b)
  return gameData.genderSpecific.some((g) => (g.a === ia && g.b === ib) || (g.a === ib && g.b === ia))
}

/**
 * Child species for two parents. A few pairs (e.g. Katress + Wixen) give a
 * different child depending on which parent is male; pass genders for those.
 */
export function breed(a: string, b: string, aGender?: Gender, bGender?: Gender): string {
  const ia = indexOf(a)
  const ib = indexOf(b)
  if (aGender && bGender) {
    for (const g of gameData.genderSpecific) {
      if (g.a === ia && g.b === ib && g.aGender === aGender && g.bGender === bGender) return gameData.pals[g.child].id
      if (g.a === ib && g.b === ia && g.aGender === bGender && g.bGender === aGender) return gameData.pals[g.child].id
    }
  }
  return gameData.pals[gameData.children[pairIndex(ia, ib)]].id
}

export interface ParentPair {
  a: string
  b: string
  /** Set when the result only happens with these genders. */
  genders?: { a: Gender; b: Gender }
}

let parentsCache: Map<string, ParentPair[]> | undefined

/** Every species pair that produces `childId`. */
export function parentsOf(childId: string): ParentPair[] {
  if (!parentsCache) {
    parentsCache = new Map()
    const add = (child: number, pair: ParentPair) => {
      const id = gameData.pals[child].id
      const list = parentsCache!.get(id) ?? []
      list.push(pair)
      parentsCache!.set(id, list)
    }
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const a = gameData.pals[i].id
        const b = gameData.pals[j].id
        if (!isGenderSpecificPair(a, b)) add(gameData.children[pairIndex(i, j)], { a, b })
      }
    }
    for (const g of gameData.genderSpecific) {
      add(g.child, { a: gameData.pals[g.a].id, b: gameData.pals[g.b].id, genders: { a: g.aGender, b: g.bGender } })
    }
  }
  return parentsCache.get(childId) ?? []
}

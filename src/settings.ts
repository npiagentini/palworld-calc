import { useCallback, useState } from 'react'

const OWNERS_KEY = 'palworld-calc.owners'
const DEFAULT_OWNERS = ['Me', 'Partner']

function readOwners(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OWNERS_KEY) ?? 'null')
    if (Array.isArray(v) && v.length > 0) return v
  } catch {
    // fall through to defaults
  }
  return DEFAULT_OWNERS
}

/** Player names used to tag who owns a pal. Stored per device. */
export function useOwners(): [string[], (owners: string[]) => void] {
  const [owners, setOwners] = useState(readOwners)
  const save = useCallback((next: string[]) => {
    const clean = next.map((o) => o.trim()).filter(Boolean)
    const value = clean.length > 0 ? clean : DEFAULT_OWNERS
    localStorage.setItem(OWNERS_KEY, JSON.stringify(value))
    setOwners(value)
  }, [])
  return [owners, save]
}

const WILD_KEY = 'palworld-calc.wild'

export interface WildSettings {
  enabled: boolean
  /** Effort of one catch, in eggs. */
  catchCost: number
  /** Highest wild level you can reach; undefined for no limit. */
  maxLevel?: number
  includeLegendaries?: boolean
}

const DEFAULT_WILD: WildSettings = { enabled: true, catchCost: 3 }

function readWild(): WildSettings {
  try {
    const v = JSON.parse(localStorage.getItem(WILD_KEY) ?? 'null')
    if (v && typeof v.catchCost === 'number') return { ...DEFAULT_WILD, ...v }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_WILD
}

/** Wild-catch planning settings, stored per device. */
export function useWildSettings(): [WildSettings, (s: WildSettings) => void] {
  const [wild, setWild] = useState(readWild)
  const save = useCallback((next: WildSettings) => {
    localStorage.setItem(WILD_KEY, JSON.stringify(next))
    setWild(next)
  }, [])
  return [wild, save]
}

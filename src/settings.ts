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

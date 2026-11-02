import { gameData } from './gameData'

export const MAX_PASSIVES = 4

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

export interface PassiveOdds {
  /** Desired passives that neither parent has (cannot be inherited). */
  missing: string[]
  /** Child has every desired passive, possibly alongside others. */
  containsAll: number
  /** Child has exactly the desired passives and nothing else. */
  exactly: number
}

/**
 * Passive inheritance odds for one egg, following the model PalCalc uses:
 *
 * 1. Roll how many passives to take from the parents' combined (deduplicated)
 *    pool, then pick that many uniformly. If the pool is smaller, take it all.
 * 2. Roll how many random passives to add on top, capped at 4 in total.
 *
 * Random passives that happen to match a desired one are ignored, so these
 * numbers are a slight underestimate.
 */
export function passiveOdds(
  parentA: string[],
  parentB: string[],
  desired: string[],
  mechanics = gameData.mechanics,
): PassiveOdds {
  const pool = [...new Set([...parentA, ...parentB])]
  const want = [...new Set(desired)]
  const missing = want.filter((p) => !pool.includes(p))
  if (missing.length > 0) return { missing, containsAll: 0, exactly: 0 }

  const n = pool.length
  const d = want.length
  const noRandom = mechanics.randomCount['0'] ?? 0
  let containsAll = 0
  let exactly = 0

  for (const [kStr, pk] of Object.entries(mechanics.inheritCount)) {
    const m = Math.min(Number(kStr), n)
    if (m < d) continue
    // chance the m picked passives include all d desired ones
    containsAll += (pk * choose(n - d, m - d)) / choose(n, m)
    if (m === d) {
      // picked exactly the desired set, then no random extras (irrelevant when already full)
      exactly += (pk / choose(n, d)) * (d >= MAX_PASSIVES ? 1 : noRandom)
    }
  }

  return { missing, containsAll, exactly }
}

/** Expected number of eggs for an outcome with probability p per egg. */
export function expectedEggs(p: number): number {
  return p > 0 ? 1 / p : Infinity
}

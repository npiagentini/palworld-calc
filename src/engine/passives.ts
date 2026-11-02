import { gameData } from './gameData'

export const MAX_PASSIVES = 4
/** Two parents with 4 passives each. */
export const MAX_POOL = 2 * MAX_PASSIVES

type Mechanics = typeof gameData.mechanics

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

/**
 * Chance that a child ends up with exactly `total` passives, `desired` of which
 * are specific ones from the parents' pool of `pool` distinct passives. The
 * other `total - desired` are "anything else": leftover parent passives or
 * random ones. This is PalCalc's model:
 *
 * 1. Roll how many passives to take from the pool (weights in the game data),
 *    then pick that many uniformly. If the pool is smaller, take it all.
 * 2. Roll how many random passives to add on top, capped at 4 in total.
 *
 * Random passives that happen to match a desired one are ignored, so the odds
 * are a slight underestimate.
 */
export function inheritProbability(pool: number, desired: number, total: number, mechanics: Mechanics = gameData.mechanics): number {
  if (desired > pool || total < desired || total > MAX_PASSIVES) return 0
  let p = 0
  for (const [kStr, pk] of Object.entries(mechanics.inheritCount)) {
    const m = Math.min(Number(kStr), pool)
    if (m < desired || m > total) continue
    // the m picked passives contain all the desired ones
    const pParent = (pk * choose(pool - desired, m - desired)) / choose(pool, m)
    const randomNeeded = total - m
    // a full child doesn't care how many extra random rolls were cut off
    const pRandom =
      total === MAX_PASSIVES
        ? Object.entries(mechanics.randomCount).reduce((s, [r, pr]) => (Number(r) >= randomNeeded ? s + pr : s), 0)
        : (mechanics.randomCount[String(randomNeeded)] ?? 0)
    p += pParent * pRandom
  }
  return p
}

/** inheritProbability for every (pool, desired, total), indexed [pool][desired][total]. */
export function inheritTable(mechanics: Mechanics = gameData.mechanics): number[][][] {
  const table: number[][][] = []
  for (let n = 0; n <= MAX_POOL; n++) {
    table.push([])
    for (let d = 0; d <= MAX_PASSIVES; d++) {
      table[n].push([])
      for (let f = 0; f <= MAX_PASSIVES; f++) table[n][d].push(inheritProbability(n, d, f, mechanics))
    }
  }
  return table
}

export interface PassiveOdds {
  /** Desired passives that neither parent has (cannot be inherited). */
  missing: string[]
  /** Child has every desired passive, possibly alongside others. */
  containsAll: number
  /** Child has exactly the desired passives and nothing else. */
  exactly: number
}

/** Passive inheritance odds for one egg from two specific parents. */
export function passiveOdds(parentA: string[], parentB: string[], desired: string[], mechanics: Mechanics = gameData.mechanics): PassiveOdds {
  const pool = [...new Set([...parentA, ...parentB])]
  const want = [...new Set(desired)]
  const missing = want.filter((p) => !pool.includes(p))
  if (missing.length > 0) return { missing, containsAll: 0, exactly: 0 }

  const n = pool.length
  const d = want.length
  let containsAll = 0
  for (let f = d; f <= MAX_PASSIVES; f++) containsAll += inheritProbability(n, d, f, mechanics)
  return { missing, containsAll, exactly: inheritProbability(n, d, d, mechanics) }
}

/** Expected number of eggs for an outcome with probability p per egg. */
export function expectedEggs(p: number): number {
  return p > 0 ? 1 / p : Infinity
}

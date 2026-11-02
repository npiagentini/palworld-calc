import { breedByIndex, gameData, palIndexOf, type Gender } from './gameData'
import { inheritTable, MAX_PASSIVES, MAX_POOL } from './passives'

export interface SolverPal {
  key: number
  palId: string
  gender: Gender
  passives: string[]
}

export interface SolveRequest {
  owned: SolverPal[]
  target: string
  /** Passive ids the final pal must have (up to 4). */
  passives: string[]
  /** Required gender of the final pal; undefined means either. */
  targetGender?: Gender
  /** How many other passives the final pal may have on top of the wanted ones. */
  maxExtra: number
  /**
   * Most other passives a bred pal may have while it carries wanted ones.
   * Junk on a carrier dilutes every later pairing, so 0 rarely loses anything
   * and makes the search several times faster.
   */
  maxCarrierExtra?: number
  /** Same, for bred pals that carry no wanted passives (species bridges). */
  maxBridgeExtra?: number
  /** Give up after this many milliseconds and return the best plan so far. */
  timeLimitMs?: number
}

export type SolveNode =
  | {
      kind: 'owned'
      key: number
      palId: string
      gender: Gender
      /** Wanted passives this pal carries. */
      passives: string[]
      extra: number
    }
  | {
      kind: 'bred'
      palId: string
      /** undefined when either gender will do (only for the final pal). */
      gender?: Gender
      passives: string[]
      /** Exact number of other passives the child should have. */
      extra: number
      parents: [SolveNode, SolveNode]
      /** Chance per egg of this exact outcome. */
      probability: number
      /** Expected eggs for this step alone. */
      eggs: number
      /** Expected eggs for this whole subtree. */
      totalEggs: number
    }

export interface SolveResult {
  /**
   * found: cheapest plan under the model. partial: time ran out, plan is the
   * best seen but may not be cheapest. timeout: time ran out with no plan.
   * unreachable: no plan exists from these pals.
   */
  status: 'found' | 'partial' | 'timeout' | 'unreachable'
  plan?: SolveNode
  statesExplored: number
  ms: number
}

// State id layout: species x gender x wanted-passive mask x extra-passive count.
// Gender 2 is a terminal "final pal" slot that is never bred further.
const GENDERS = 3
const MASKS = 1 << MAX_PASSIVES
const EXTRAS = MAX_PASSIVES + 1
const ANY = 2
const BITS = Array.from({ length: MASKS }, (_, m) => {
  let c = 0
  for (let x = m; x; x &= x - 1) c++
  return c
})

/** Min-heap of state ids keyed by priority, with lazy deletion. */
class Heap {
  private ids: number[] = []
  private keys: number[] = []
  get size() {
    return this.ids.length
  }
  push(id: number, key: number) {
    const { ids, keys } = this
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      ids[i] = ids[p]
      keys[i] = keys[p]
      i = p
    }
    ids[i] = id
    keys[i] = key
  }
  pop(): [number, number] {
    const { ids, keys } = this
    const topId = ids[0]
    const topKey = keys[0]
    const lastId = ids.pop()!
    const lastKey = keys.pop()!
    const n = ids.length
    if (n > 0) {
      let i = 0
      while (true) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && keys[c + 1] < keys[c]) c++
        if (keys[c] >= lastKey) break
        ids[i] = ids[c]
        keys[i] = keys[c]
        i = c
      }
      ids[i] = lastId
      keys[i] = lastKey
    }
    return [topId, topKey]
  }
}

/** childOf[male * n + female]: child species index for a male and a female parent. */
let childTable: Int16Array | undefined
function childOf(): Int16Array {
  if (!childTable) {
    const n = gameData.pals.length
    childTable = new Int16Array(n * n)
    for (let m = 0; m < n; m++) for (let f = 0; f < n; f++) childTable[m * n + f] = breedByIndex(m, f, 'M', 'F')
  }
  return childTable
}

/** Fewest breeding steps from each species to `target`, if the partner were free. */
function stepsToTarget(target: number, children: Int16Array): Int32Array {
  const n = gameData.pals.length
  const dist = new Int32Array(n).fill(1 << 20)
  dist[target] = 0
  for (let changed = true; changed; ) {
    changed = false
    for (let s = 0; s < n; s++) {
      let d = dist[s]
      for (let q = 0; q < n; q++) {
        d = Math.min(d, 1 + dist[children[s * n + q]], 1 + dist[children[q * n + s]])
      }
      if (d < dist[s]) {
        dist[s] = d
        changed = true
      }
    }
  }
  return dist
}

/**
 * Finds the plan with the fewest expected eggs that ends in `target` carrying
 * all wanted passives.
 *
 * Every pal (owned or bred) is summarised as (species, gender, which wanted
 * passives it has, how many other passives it has). Owned pals cost 0 eggs. A
 * bred child costs both parents' subtrees plus 1/p eggs, where p is the chance
 * of that exact outcome, including gender. Parents are not used up by
 * breeding, so subtrees can share pals.
 *
 * Because a child always costs more than either parent, a best-first search
 * (Knuth's generalisation of Dijkstra) is optimal: the first time the final
 * slot is popped, its plan is the cheapest. The order is A*-style: cost plus
 * the remaining species steps to the target at the minimum egg cost per step.
 * A pal is skipped when another pal of the same species and gender finished
 * first with a superset of its wanted passives and no more extras.
 */
export function solve(req: SolveRequest): SolveResult {
  const started = Date.now()
  const deadline = started + (req.timeLimitMs ?? 20_000)
  const wanted = [...new Set(req.passives)].slice(0, MAX_PASSIVES)
  const fullMask = (1 << wanted.length) - 1
  const bit = new Map(wanted.map((p, i) => [p, 1 << i]))
  const target = palIndexOf(req.target)
  const maxExtra = Math.min(req.maxExtra, MAX_PASSIVES - wanted.length)
  const maxCarrierExtra = req.maxCarrierExtra ?? 0
  const maxBridgeExtra = req.maxBridgeExtra ?? 2
  const pals = gameData.pals
  const n = pals.length
  const children = childOf()

  // flat [pool][desired][total] inheritance table
  const nested = inheritTable()
  const table = new Float64Array((MAX_POOL + 1) * (MAX_PASSIVES + 1) * EXTRAS)
  for (let pool = 0; pool <= MAX_POOL; pool++)
    for (let d = 0; d <= MAX_PASSIVES; d++)
      for (let f = 0; f <= MAX_PASSIVES; f++) table[(pool * (MAX_PASSIVES + 1) + d) * EXTRAS + f] = nested[pool][d][f]

  // no single egg outcome beats the best table entry, so each step costs at least 1/maxP eggs
  const minStep = 1 / Math.max(...table)
  const h = Array.from(stepsToTarget(target, children), (steps) => steps * minStep)
  const male = pals.map((p) => p.maleChance)
  const female = pals.map((p) => 1 - p.maleChance)
  const finalChance = pals.map((p) => (req.targetGender === 'M' ? p.maleChance : req.targetGender === 'F' ? 1 - p.maleChance : 1))

  const total = n * GENDERS * MASKS * EXTRAS
  const best = new Float64Array(total).fill(Infinity)
  const parentA = new Int32Array(total).fill(-1)
  const parentB = new Int32Array(total).fill(-1)
  const stepP = new Float64Array(total)
  const ownedBy = new Map<number, SolverPal>()
  const done = new Uint8Array(total)
  const heap = new Heap()
  const encode = (sp: number, g: number, mask: number, extra: number) => ((sp * GENDERS + g) * MASKS + mask) * EXTRAS + extra
  const result = (status: SolveResult['status'], id?: number): SolveResult => ({
    status,
    plan: id === undefined ? undefined : build(id),
    statesExplored: explored,
    ms: Date.now() - started,
  })

  // cheapest complete plan seen so far; anything costlier is pruned
  let bound = Infinity
  let boundId = -1
  let explored = 0

  for (const o of req.owned) {
    const distinct = new Set(o.passives)
    let mask = 0
    for (const p of distinct) mask |= bit.get(p) ?? 0
    const extra = Math.min(distinct.size - BITS[mask], MAX_PASSIVES)
    const sp = palIndexOf(o.palId)
    const id = encode(sp, o.gender === 'M' ? 0 : 1, mask, extra)
    if (best[id] === 0) continue
    best[id] = 0
    ownedBy.set(id, o)
    heap.push(id, h[sp])
    if (sp === target && mask === fullMask && extra <= maxExtra && (!req.targetGender || req.targetGender === o.gender)) {
      return result('found', id)
    }
  }

  const relax = (id: number, cost: number, est: number, a: number, b: number, p: number) => {
    if (cost >= best[id] || est >= bound) return
    best[id] = cost
    parentA[id] = a
    parentB[id] = b
    stepP[id] = p
    heap.push(id, est)
  }

  const combine = (x: number, xG: number, xSp: number, xMask: number, xExtra: number, y: number, ySp: number, yMask: number, yExtra: number, base: number) => {
    const child = xG === 0 ? children[xSp * n + ySp] : children[ySp * n + xSp]
    const union = xMask | yMask
    const pool = Math.min(BITS[union] + xExtra + yExtra, MAX_POOL)
    const pm = male[child]
    const pf = female[child]
    const hc = h[child]
    const isTarget = child === target

    // every subset of the parents' wanted passives the child could keep
    for (let s = union; ; s = (s - 1) & union) {
      const d = BITS[s]
      const row = (pool * (MAX_PASSIVES + 1) + d) * EXTRAS
      const finalOk = isTarget && s === fullMask
      const cap = d > 0 ? maxCarrierExtra : maxBridgeExtra
      for (let f = d; f <= MAX_PASSIVES; f++) {
        const p = table[row + f]
        if (p <= 0) continue
        const extra = f - d
        if (extra <= cap) {
          const id = encode(child, 0, s, extra)
          if (pm > 0) {
            const c = base + 1 / (p * pm)
            relax(id, c, c + hc, x, y, p * pm)
          }
          if (pf > 0) {
            const c = base + 1 / (p * pf)
            relax(id + MASKS * EXTRAS, c, c + hc, x, y, p * pf)
          }
        }
        if (finalOk && extra <= maxExtra && finalChance[child] > 0) {
          const pg = p * finalChance[child]
          const c = base + 1 / pg
          const id = encode(child, ANY, s, extra)
          relax(id, c, c, x, y, pg)
          if (best[id] < bound) {
            bound = best[id]
            boundId = id
          }
        }
      }
      if (s === 0) break
    }
  }

  // finished pals per gender as parallel arrays, so pairing them is cheap
  const fin = [0, 1].map(() => ({ id: [] as number[], sp: [] as number[], mask: [] as number[], extra: [] as number[], cost: [] as number[] }))
  // per (species, gender): finished (mask << 3 | extra) for the dominance check
  const buckets = new Map<number, number[]>()

  while (heap.size > 0) {
    const [id, est] = heap.pop()
    if (done[id]) continue
    const extra = id % EXTRAS
    const mask = Math.floor(id / EXTRAS) % MASKS
    const g = Math.floor(id / (EXTRAS * MASKS)) % GENDERS
    const sp = Math.floor(id / (EXTRAS * MASKS * GENDERS))
    const cost = best[id]
    // stale entry from before a cheaper route to this state was found
    if (est > cost + (g === ANY ? 0 : h[sp]) + 1e-9) continue
    done[id] = 1

    if (g === ANY) return result('found', id)

    const bucketKey = sp * 2 + g
    const bucket = buckets.get(bucketKey) ?? []
    if (bucket.some((o) => ((o >> 3) & mask) === mask && (o & 7) <= extra)) continue
    bucket.push((mask << 3) | extra)
    buckets.set(bucketKey, bucket)

    if ((++explored & 255) === 0 && Date.now() > deadline) {
      return boundId >= 0 ? result('partial', boundId) : result('timeout')
    }

    const other = fin[1 - g]
    for (let i = 0; i < other.id.length; i++) {
      const base = cost + other.cost[i]
      if (base + minStep >= bound) continue
      combine(id, g, sp, mask, extra, other.id[i], other.sp[i], other.mask[i], other.extra[i], base)
    }
    const mine = fin[g]
    mine.id.push(id)
    mine.sp.push(sp)
    mine.mask.push(mask)
    mine.extra.push(extra)
    mine.cost.push(cost)
  }

  return boundId >= 0 ? result('found', boundId) : result('unreachable')

  function build(id: number): SolveNode {
    const extra = id % EXTRAS
    const mask = Math.floor(id / EXTRAS) % MASKS
    const g = Math.floor(id / (EXTRAS * MASKS)) % GENDERS
    const sp = Math.floor(id / (EXTRAS * MASKS * GENDERS))
    const passives = wanted.filter((_, i) => mask & (1 << i))
    const owned = ownedBy.get(id)
    if (owned && best[id] === 0) {
      return { kind: 'owned', key: owned.key, palId: owned.palId, gender: owned.gender, passives, extra }
    }
    return {
      kind: 'bred',
      palId: pals[sp].id,
      gender: g === 0 ? 'M' : g === 1 ? 'F' : req.targetGender,
      passives,
      extra,
      parents: [build(parentA[id]), build(parentB[id])],
      probability: stepP[id],
      eggs: 1 / stepP[id],
      totalEggs: best[id],
    }
  }
}

export interface SolveStep {
  node: Extract<SolveNode, { kind: 'bred' }>
  parents: [SolveNode, SolveNode]
}

/** Breeding steps in the order you would do them (parents before children). */
export function solveSteps(node: SolveNode, seen = new Set<string>()): SolveStep[] {
  if (node.kind === 'owned') return []
  const key = `${node.palId}|${node.gender}|${node.passives.join()}|${node.extra}`
  if (seen.has(key)) return []
  seen.add(key)
  return [...solveSteps(node.parents[0], seen), ...solveSteps(node.parents[1], seen), { node, parents: node.parents }]
}

import { breed, gameData, isGenderSpecificPair, type Gender } from './gameData'

/** A pal you own, as far as species breeding is concerned. */
export interface OwnedRef {
  key: number
  palId: string
  gender: Gender
}

export type PlanNode =
  | { kind: 'owned'; palId: string; owned: OwnedRef[] }
  | {
      kind: 'bred'
      palId: string
      parents: [PlanNode, PlanNode]
      /** Required parent genders, when the pair only works one way round. */
      genders?: [Gender, Gender]
      steps: number
    }

export interface BreedStep {
  parentA: PlanNode
  parentB: PlanNode
  child: string
  genders?: [Gender, Gender]
}

interface Best {
  node: PlanNode
  cost: number
  /** Genders available for this species without extra rolls. */
  genders: Set<Gender>
}

export function stepsOf(node: PlanNode): number {
  return node.kind === 'owned' ? 0 : node.steps
}

function pairOptions(a: Best, b: Best, sameSpecies: boolean): { child: string; genders?: [Gender, Gender] }[] {
  const aId = a.node.palId
  const bId = b.node.palId
  if (sameSpecies) {
    if (!(a.genders.has('M') && a.genders.has('F'))) return []
    return [{ child: aId }]
  }
  const combos: [Gender, Gender][] = []
  for (const ga of a.genders) for (const gb of b.genders) if (ga !== gb) combos.push([ga, gb])
  if (combos.length === 0) return []
  if (!isGenderSpecificPair(aId, bId)) return [{ child: breed(aId, bId) }]
  return combos.map((g) => ({ child: breed(aId, bId, g[0], g[1]), genders: g }))
}

/**
 * Plans the fewest breeding steps to reach every species reachable from the
 * pals you own. Owned species cost 0; a bred species costs 1 plus the cost of
 * both parent subtrees. Bred children are assumed obtainable in either gender
 * (re-roll eggs as needed), owned pals only in the genders you have.
 *
 * This is Knuth's generalisation of Dijkstra: finalise the cheapest species,
 * then try pairing it with every species finalised so far.
 */
export function planAll(owned: OwnedRef[]): Map<string, PlanNode> {
  const best = new Map<string, Best>()
  for (const o of owned) {
    const cur = best.get(o.palId)
    if (cur && cur.node.kind === 'owned') {
      cur.node.owned.push(o)
      cur.genders.add(o.gender)
    } else {
      best.set(o.palId, { node: { kind: 'owned', palId: o.palId, owned: [o] }, cost: 0, genders: new Set([o.gender]) })
    }
  }

  const done = new Map<string, Best>()
  const consider = (child: string, a: Best, b: Best, genders?: [Gender, Gender]) => {
    if (done.has(child)) return
    const cost = 1 + a.cost + b.cost
    const cur = best.get(child)
    if (cur && cur.cost <= cost) return
    best.set(child, {
      node: { kind: 'bred', palId: child, parents: [a.node, b.node], genders, steps: cost },
      cost,
      genders: new Set<Gender>(['M', 'F']),
    })
  }

  while (true) {
    let next: Best | undefined
    for (const [id, b] of best) if (!done.has(id) && (!next || b.cost < next.cost)) next = b
    if (!next) break
    done.set(next.node.palId, next)
    for (const other of done.values()) {
      const same = other === next
      for (const opt of pairOptions(next, other, same)) consider(opt.child, next, other, opt.genders)
    }
  }

  const result = new Map<string, PlanNode>()
  for (const [id, b] of done) result.set(id, b.node)
  return result
}

export function planFor(owned: OwnedRef[], target: string): PlanNode | undefined {
  return planAll(owned).get(target)
}

/** Breeding steps in the order you would do them (parents before children). */
export function flattenSteps(node: PlanNode, seen = new Set<string>()): BreedStep[] {
  if (node.kind === 'owned' || seen.has(node.palId)) return []
  seen.add(node.palId)
  const [a, b] = node.parents
  return [
    ...flattenSteps(a, seen),
    ...flattenSteps(b, seen),
    { parentA: a, parentB: b, child: node.palId, genders: node.genders },
  ]
}

/** Species you can breed right now from a single pairing of owned pals. */
export function oneStepChildren(owned: OwnedRef[]): { child: string; a: OwnedRef; b: OwnedRef }[] {
  const seen = new Map<string, { child: string; a: OwnedRef; b: OwnedRef }>()
  const ownedSpecies = new Set(owned.map((o) => o.palId))
  for (let i = 0; i < owned.length; i++) {
    for (let j = i + 1; j < owned.length; j++) {
      const a = owned[i]
      const b = owned[j]
      if (a.gender === b.gender) continue
      const child = breed(a.palId, b.palId, a.gender, b.gender)
      if (!ownedSpecies.has(child) && !seen.has(child)) seen.set(child, { child, a, b })
    }
  }
  const order = new Map(gameData.pals.map((p, i) => [p.id, i]))
  return [...seen.values()].sort((x, y) => order.get(x.child)! - order.get(y.child)!)
}

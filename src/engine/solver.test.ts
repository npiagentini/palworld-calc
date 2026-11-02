import { describe, expect, it } from 'vitest'
import { breed, gameData, getPal, type Gender } from './gameData'
import { inheritProbability } from './passives'
import { solve, solveSteps, type SolveNode, type SolverPal } from './solver'

const pid = (name: string) => {
  const p = gameData.pals.find((x) => x.name === name)
  if (!p) throw new Error(`no pal named ${name}`)
  return p.id
}
const sid = (name: string) => gameData.passives.find((p) => p.name === name)!.id

let key = 0
const pal = (name: string, gender: Gender, passives: string[] = []): SolverPal => ({
  key: key++,
  palId: pid(name),
  gender,
  passives: passives.map(sid),
})

/** Checks every bred step is a legal pairing with the probability the model gives. */
function checkPlan(node: SolveNode, wanted: string[], owned: SolverPal[]) {
  for (const step of solveSteps(node)) {
    const [a, b] = step.parents
    const genders = [a.gender, b.gender]
    expect(genders).toContain('M')
    expect(genders).toContain('F')
    expect(breed(a.palId, b.palId, a.gender, b.gender)).toBe(step.node.palId)
    const union = new Set([...a.passives, ...b.passives])
    for (const p of step.node.passives) expect(union.has(p)).toBe(true)
    const pool = union.size + a.extra + b.extra
    const g = step.node.gender
    const male = getPal(step.node.palId).maleChance
    const gChance = g === 'M' ? male : g === 'F' ? 1 - male : 1
    const expected = inheritProbability(Math.min(pool, 8), step.node.passives.length, step.node.passives.length + step.node.extra) * gChance
    expect(step.node.probability).toBeCloseTo(expected, 9)
  }
  // owned leaves really are owned pals with matching passives
  const leaves = (n: SolveNode): SolveNode[] => (n.kind === 'owned' ? [n] : n.parents.flatMap(leaves))
  for (const leaf of leaves(node)) {
    if (leaf.kind !== 'owned') continue
    const o = owned.find((x) => x.key === leaf.key)!
    expect(o.palId).toBe(leaf.palId)
    for (const p of leaf.passives) expect(o.passives).toContain(p)
    expect(leaf.passives.every((p) => wanted.includes(p))).toBe(true)
  }
}

describe('solve', () => {
  it('returns an owned pal that already matches', () => {
    const owned = [pal('Anubis', 'M', ['Swift', 'Legend'])]
    const r = solve({ owned, target: pid('Anubis'), passives: [sid('Swift')], maxExtra: 1 })
    expect(r.status).toBe('found')
    expect(r.plan?.kind).toBe('owned')
  })

  it('respects maxExtra on an owned match', () => {
    const owned = [pal('Anubis', 'M', ['Swift', 'Legend'])]
    const r = solve({ owned, target: pid('Anubis'), passives: [sid('Swift')], maxExtra: 0 })
    expect(r.plan?.kind).not.toBe('owned')
  })

  it('finds the one-step plan and its odds', () => {
    const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F', ['Legend'])]
    const child = breed(pid('Lamball'), pid('Cattiva'))
    const r = solve({ owned, target: child, passives: [sid('Swift'), sid('Legend')], maxExtra: 0 })
    expect(r.status).toBe('found')
    const plan = r.plan!
    expect(plan.kind).toBe('bred')
    if (plan.kind !== 'bred') return
    expect(solveSteps(plan)).toHaveLength(1)
    expect(plan.probability).toBeCloseTo(inheritProbability(2, 2, 2))
    expect(plan.totalEggs).toBeCloseTo(1 / inheritProbability(2, 2, 2))
  })

  it('applies the target gender', () => {
    const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F', ['Legend'])]
    const child = breed(pid('Lamball'), pid('Cattiva'))
    const any = solve({ owned, target: child, passives: [sid('Swift'), sid('Legend')], maxExtra: 0 })
    const female = solve({ owned, target: child, passives: [sid('Swift'), sid('Legend')], maxExtra: 0, targetGender: 'F' })
    if (any.plan?.kind !== 'bred' || female.plan?.kind !== 'bred') throw new Error('expected bred plans')
    expect(female.plan.gender).toBe('F')
    expect(female.plan.probability).toBeCloseTo(any.plan.probability * (1 - getPal(child).maleChance))
  })

  it('reports unreachable when a wanted passive is not owned', () => {
    const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F')]
    const r = solve({ owned, target: pid('Anubis'), passives: [sid('Swift'), sid('Legend')], maxExtra: 0 })
    expect(r.status).toBe('unreachable')
  })

  it('reports unreachable for a species that only breeds from itself', () => {
    const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F')]
    const r = solve({ owned, target: pid('Jetragon'), passives: [sid('Swift')], maxExtra: 0 })
    expect(r.status).toBe('unreachable')
  })

  it('produces a legal multi-step plan for several passives', () => {
    const owned = [
      pal('Lamball', 'M', ['Swift']),
      pal('Cattiva', 'F', ['Legend']),
      pal('Chikipi', 'M', ['Runner', 'Brittle']),
      pal('Foxparks', 'F'),
      pal('Pengullet', 'M'),
      pal('Direhowl', 'F'),
    ]
    const wanted = [sid('Swift'), sid('Legend'), sid('Runner')]
    const r = solve({ owned, target: pid('Anubis'), passives: wanted, maxExtra: 0 })
    expect(r.status).toBe('found')
    const plan = r.plan!
    expect(plan.palId).toBe(pid('Anubis'))
    expect([...plan.passives].sort()).toEqual([...wanted].sort())
    expect(plan.extra).toBe(0)
    checkPlan(plan, wanted, owned)
  })

  it('thorough search is never worse than the default', () => {
    const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F', ['Legend']), pal('Foxparks', 'F'), pal('Pengullet', 'M')]
    const req = { owned, target: pid('Anubis'), passives: [sid('Swift'), sid('Legend')], maxExtra: 0 }
    const fast = solve(req)
    const slow = solve({ ...req, maxCarrierExtra: 4, maxBridgeExtra: 4 })
    if (fast.plan?.kind !== 'bred' || slow.plan?.kind !== 'bred') throw new Error('expected bred plans')
    expect(slow.plan.totalEggs).toBeLessThanOrEqual(fast.plan.totalEggs + 1e-9)
  })
})

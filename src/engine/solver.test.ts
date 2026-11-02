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
  const leaves = (n: SolveNode): SolveNode[] => (n.kind === 'bred' ? n.parents.flatMap(leaves) : [n])
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

  describe('wild catches', () => {
    const wildLeaves = (n: SolveNode): Extract<SolveNode, { kind: 'wild' }>[] =>
      n.kind === 'wild' ? [n] : n.kind === 'bred' ? n.parents.flatMap(wildLeaves) : []

    it('make an unbreedable species reachable by catching it', () => {
      const owned = [pal('Lamball', 'M'), pal('Cattiva', 'F')]
      const r = solve({ owned, target: pid('Jetragon'), passives: [], maxExtra: 4, wild: { catchCost: 3, includeLegendaries: true } })
      expect(r.status).toBe('found')
      if (r.plan?.kind !== 'wild') throw new Error('expected a wild catch')
      // either gender is fine, so a single catch
      expect(r.plan.totalEggs).toBeCloseTo(3)
    })

    it('respect the level cap', () => {
      const owned = [pal('Lamball', 'M'), pal('Cattiva', 'F')]
      const jetragonMin = getPal(pid('Jetragon')).wildLevels![0]
      const r = solve({
        owned,
        target: pid('Jetragon'),
        passives: [],
        maxExtra: 4,
        wild: { catchCost: 3, maxLevel: jetragonMin - 1, includeLegendaries: true },
      })
      expect(r.status).toBe('unreachable')
    })

    it('never suggest species above the level cap or that do not spawn', () => {
      const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F', ['Legend'])]
      const r = solve({ owned, target: pid('Anubis'), passives: [sid('Swift'), sid('Legend')], maxExtra: 0, wild: { catchCost: 3, maxLevel: 20 } })
      expect(r.status).toBe('found')
      for (const w of wildLeaves(r.plan!)) {
        const levels = getPal(w.palId).wildLevels
        expect(levels).not.toBeNull()
        expect(levels![0]).toBeLessThanOrEqual(20)
      }
    })

    it('leave legendaries out unless asked', () => {
      const owned = [pal('Lamball', 'M'), pal('Cattiva', 'F')]
      expect(solve({ owned, target: pid('Jetragon'), passives: [], maxExtra: 4, wild: { catchCost: 3 } }).status).toBe('unreachable')
      const legendOwned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F')]
      const r = solve({ owned: legendOwned, target: pid('Anubis'), passives: [sid('Swift'), sid('Legend')], maxExtra: 0, wild: { catchCost: 3 } })
      // only legendaries spawn with Legend, so without them it can't be done
      expect(r.status).toBe('unreachable')
    })

    it('price a catch by the gender needed', () => {
      const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F', ['Legend'])]
      const r = solve({ owned, target: pid('Anubis'), passives: [sid('Swift'), sid('Legend')], maxExtra: 0, wild: { catchCost: 3 } })
      const wild = wildLeaves(r.plan!)
      expect(wild.length).toBeGreaterThan(0)
      for (const w of wild) {
        const male = getPal(w.palId).maleChance
        const chance = w.gender === 'M' ? male : w.gender === 'F' ? 1 - male : 1
        expect(w.catches).toBeCloseTo(1 / chance)
        expect(w.totalEggs).toBeCloseTo(3 / chance)
      }
      checkPlan(r.plan!, [sid('Swift'), sid('Legend')], owned)
    })

    it('shorten plans compared to owned pals only', () => {
      const owned = [pal('Lamball', 'M', ['Swift']), pal('Cattiva', 'F', ['Legend']), pal('Foxparks', 'F'), pal('Pengullet', 'M')]
      const req = { owned, target: pid('Anubis'), passives: [sid('Swift'), sid('Legend')], maxExtra: 0 }
      const without = solve(req)
      const withWild = solve({ ...req, wild: { catchCost: 3 } })
      if (without.plan?.kind !== 'bred' || withWild.plan?.kind !== 'bred') throw new Error('expected bred plans')
      expect(withWild.plan.totalEggs).toBeLessThan(without.plan.totalEggs)
    })

    it('include guaranteed passives on the catch', () => {
      const withGuaranteed = gameData.pals.find((p) => p.wildLevels && p.guaranteedPassives.some((g) => gameData.passives.some((x) => x.id === g)))
      if (!withGuaranteed) return
      const passive = withGuaranteed.guaranteedPassives.find((g) => gameData.passives.some((x) => x.id === g))!
      const r = solve({ owned: [], target: withGuaranteed.id, passives: [passive], maxExtra: 4, wild: { catchCost: 3, includeLegendaries: true } })
      expect(r.plan?.kind).toBe('wild')
      expect(r.plan?.passives).toEqual([passive])
    })
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

import { describe, expect, it } from 'vitest'
import { breed, gameData, parentsOf, type Gender } from './gameData'
import { passiveOdds } from './passives'
import { flattenSteps, oneStepChildren, planAll, planFor, type OwnedRef } from './pathfinder'

const id = (name: string) => {
  const p = gameData.pals.find((x) => x.name === name)
  if (!p) throw new Error(`no pal named ${name}`)
  return p.id
}
const name = (palId: string) => gameData.pals.find((p) => p.id === palId)!.name

let key = 0
const own = (palName: string, gender: Gender): OwnedRef => ({ key: key++, palId: id(palName), gender })

describe('breed', () => {
  it('same species gives the same species', () => {
    expect(name(breed(id('Lamball'), id('Lamball')))).toBe('Lamball')
  })

  it('is symmetric', () => {
    expect(breed(id('Lamball'), id('Cattiva'))).toBe(breed(id('Cattiva'), id('Lamball')))
  })

  it('applies unique combos', () => {
    expect(name(breed(id('Relaxaurus'), id('Sparkit')))).toBe('Relaxaurus Lux')
  })

  it('applies gender-specific combos', () => {
    expect(name(breed(id('Katress'), id('Wixen'), 'F', 'M'))).toBe('Katress Ignis')
    expect(name(breed(id('Wixen'), id('Katress'), 'M', 'F'))).toBe('Katress Ignis')
    expect(name(breed(id('Katress'), id('Wixen'), 'M', 'F'))).toBe('Wixen Noct')
  })

  it('parentsOf is consistent with breed', () => {
    const pairs = parentsOf(id('Relaxaurus Lux'))
    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs) expect(breed(p.a, p.b, p.genders?.a, p.genders?.b)).toBe(id('Relaxaurus Lux'))
  })
})

describe('passiveOdds', () => {
  const m = gameData.mechanics

  it('reports desired passives the parents lack', () => {
    const r = passiveOdds(['Swift'], [], ['Swift', 'Legend'])
    expect(r.missing).toEqual(['Legend'])
    expect(r.containsAll).toBe(0)
  })

  it('one parent passive wanted: always inherited', () => {
    // pool of 1, every inherit roll takes it
    expect(passiveOdds(['A'], [], ['A']).containsAll).toBeCloseTo(1)
    // ... and nothing else is added 40% of the time
    expect(passiveOdds(['A'], [], ['A']).exactly).toBeCloseTo(m.randomCount['0'])
  })

  it('two of two: needs an inherit roll of 2 or more', () => {
    const r = passiveOdds(['A'], ['B'], ['A', 'B'])
    expect(r.containsAll).toBeCloseTo(m.inheritCount['2'] + m.inheritCount['3'] + m.inheritCount['4'])
  })

  it('one specific out of four', () => {
    const r = passiveOdds(['A', 'B'], ['C', 'D'], ['A'])
    // k picks out of 4 include A with probability k/4
    const expected = [1, 2, 3, 4].reduce((s, k) => s + m.inheritCount[String(k)] * (k / 4), 0)
    expect(r.containsAll).toBeCloseTo(expected)
    expect(r.exactly).toBeCloseTo(m.inheritCount['1'] * 0.25 * m.randomCount['0'])
  })

  it('four of four: random extras do not matter', () => {
    const r = passiveOdds(['A', 'B'], ['C', 'D'], ['A', 'B', 'C', 'D'])
    expect(r.containsAll).toBeCloseTo(m.inheritCount['4'])
    expect(r.exactly).toBeCloseTo(m.inheritCount['4'])
  })

  it('deduplicates shared parent passives', () => {
    expect(passiveOdds(['A'], ['A'], ['A']).containsAll).toBeCloseTo(1)
  })
})

describe('pathfinder', () => {
  it('owned species need no steps', () => {
    const plan = planFor([own('Lamball', 'M')], id('Lamball'))
    expect(plan?.kind).toBe('owned')
  })

  it('needs opposite genders', () => {
    const plans = planAll([own('Lamball', 'M'), own('Cattiva', 'M')])
    expect(plans.size).toBe(2)
  })

  it('finds a one-step child', () => {
    const child = breed(id('Lamball'), id('Cattiva'))
    const plan = planFor([own('Lamball', 'M'), own('Cattiva', 'F')], child)
    expect(plan?.kind).toBe('bred')
    expect(flattenSteps(plan!)).toHaveLength(1)
  })

  it('every step in a plan is a valid breeding', () => {
    const owned = [own('Lamball', 'M'), own('Cattiva', 'F'), own('Chikipi', 'M'), own('Foxparks', 'F'), own('Pengullet', 'M')]
    const plans = planAll(owned)
    expect(plans.size).toBeGreaterThan(10)
    for (const [target, plan] of plans) {
      const steps = flattenSteps(plan)
      for (const s of steps) {
        const g = s.genders
        expect(breed(s.parentA.palId, s.parentB.palId, g?.[0], g?.[1])).toBe(s.child)
      }
      if (steps.length > 0) expect(steps[steps.length - 1].child).toBe(target)
    }
  })

  it('oneStepChildren skips same-gender pairs and owned species', () => {
    const owned = [own('Lamball', 'M'), own('Cattiva', 'F'), own('Chikipi', 'M')]
    const kids = oneStepChildren(owned)
    for (const k of kids) {
      expect(k.a.gender).not.toBe(k.b.gender)
      expect(owned.some((o) => o.palId === k.child)).toBe(false)
    }
  })
})

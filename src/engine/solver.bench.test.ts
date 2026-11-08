import { describe, it } from 'vitest'
import { gameData, type Gender } from './gameData'
import { solve, solveSteps, type SolveNode, type SolveRequest, type SolverPal } from './solver'

// Rough timings on realistic inventories. Run with:
//   BENCH=1 npx vitest run src/engine/solver.bench.test.ts --disableConsoleIntercept
const pid = (name: string) => gameData.pals.find((p) => p.name === name)!.id
const sid = (name: string) => gameData.passives.find((p) => p.name === name)!.id

function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
}

function inventory(seed: number, size: number, carriers: [string, Gender, string[]][]): SolverPal[] {
  const r = rng(seed)
  const junk = gameData.passives.filter((p) => p.rank <= 1).map((p) => p.id)
  const pals: SolverPal[] = carriers.map(([n, g, ps], i) => ({ key: i, palId: pid(n), gender: g, passives: ps.map(sid) }))
  for (let i = pals.length; i < size; i++) {
    const sp = gameData.pals[Math.floor(r() * 200)].id
    const nj = Math.floor(r() * 3)
    pals.push({ key: i, palId: sp, gender: r() < 0.5 ? 'M' : 'F', passives: Array.from({ length: nj }, () => junk[Math.floor(r() * junk.length)]) })
  }
  return pals
}

const cases: [string, number, string, string[], [string, Gender, string[]][]][] = [
  ['2 passives', 30, 'Anubis', ['Swift', 'Legend'], [['Lamball', 'M', ['Swift']], ['Cattiva', 'F', ['Legend']]]],
  ['3 passives', 40, 'Anubis', ['Swift', 'Legend', 'Runner'], [['Lamball', 'M', ['Swift', 'Brittle']], ['Cattiva', 'F', ['Legend']], ['Chikipi', 'M', ['Runner']]]],
  ['4 passives', 60, 'Anubis', ['Swift', 'Legend', 'Runner', 'Nimble'], [['Lamball', 'M', ['Swift']], ['Cattiva', 'F', ['Legend']], ['Chikipi', 'M', ['Runner']], ['Foxparks', 'F', ['Nimble']]]],
  ['4 work passives, 100 pals', 100, 'Jormuntide', ['Artisan', 'Serious', 'Lucky', 'Workaholic'], [['Lamball', 'M', ['Artisan']], ['Cattiva', 'F', ['Serious', 'Lucky']], ['Chikipi', 'M', ['Workaholic']], ['Foxparks', 'F', ['Lucky']]]],
  // a whole imported save
  ['2 passives, 400 pals', 400, 'Anubis', ['Swift', 'Legend'], [['Lamball', 'M', ['Swift']], ['Cattiva', 'F', ['Legend']]]],
  ['4 work passives, 400 pals', 400, 'Jormuntide', ['Artisan', 'Serious', 'Lucky', 'Workaholic'], [['Lamball', 'M', ['Artisan']], ['Cattiva', 'F', ['Serious', 'Lucky']], ['Chikipi', 'M', ['Workaholic']], ['Foxparks', 'F', ['Lucky']]]],
]

const configs: [string, Partial<SolveRequest>][] = [
  ['default', {}],
  ['thorough', { maxCarrierExtra: 4, maxBridgeExtra: 4, timeLimitMs: 120_000 }],
  ['wild, 3 eggs/catch', { wild: { catchCost: 3 } }],
  ['wild, 3 eggs/catch, level 30', { wild: { catchCost: 3, maxLevel: 30 } }],
]

describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BENCH)('solver bench', () => {
  for (const [label, size, target, passives, carriers] of cases)
    for (const [cfgName, cfg] of configs)
      it(`${label} (${cfgName})`, () => {
        const owned = inventory(42, size, carriers)
        const r = solve({ owned, target: pid(target), passives: passives.map(sid), maxExtra: 0, ...cfg })
        const steps = r.plan ? solveSteps(r.plan).length : 0
        const eggs = r.plan?.kind === 'bred' ? r.plan.totalEggs.toFixed(1) : '-'
        const catches = (n: SolveNode): number => (n.kind === 'wild' ? 1 : n.kind === 'bred' ? catches(n.parents[0]) + catches(n.parents[1]) : 0)
        const c = r.plan ? catches(r.plan) : 0
        console.log(`${label} (${cfgName}): ${r.status} in ${r.ms} ms, ${r.statesExplored} states, ${steps} steps, ${c} catches, ${eggs} eggs`)
      }, 300_000)
})

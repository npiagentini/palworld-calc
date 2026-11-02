// Builds src/data/game-data.json from PalCalc's generated game database.
//
// PalCalc (MIT, https://github.com/tylercamp/palcalc) extracts Pal stats, passive
// skills and the full breeding table from the game files. We pin a commit so the
// data only changes when this script is re-run on purpose.
//
// Usage:
//   node scripts/build-data.mjs              # use the pinned commit
//   node scripts/build-data.mjs <commit|main>  # pull a different revision

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PINNED_COMMIT = '08fe1eea5dcd627f83eadf0876a2010574d29f67'
const ref = process.argv[2] ?? PINNED_COMMIT
const base = `https://raw.githubusercontent.com/tylercamp/palcalc/${ref}/PalCalc.Model`
const outPath = fileURLToPath(new URL('../src/data/game-data.json', import.meta.url))

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / total]))
}

const [db, breeding] = await Promise.all([
  fetchJson(`${base}/db.json`),
  fetchJson(`${base}/breeding.json`),
])

const pals = db.Pals.map((p) => ({
  id: p.InternalName,
  name: p.Name,
  dex: p.Id.PalDexNo,
  variant: p.Id.IsVariant,
  power: p.BreedingPower,
  maleChance: db.BreedingGenderProbability[p.InternalName]?.MALE ?? 0.5,
  guaranteedPassives: p.GuaranteedPassivesInternalIds,
})).sort((a, b) => a.dex - b.dex || Number(a.variant) - Number(b.variant) || a.name.localeCompare(b.name))

const palIndex = new Map(pals.map((p, i) => [p.id, i]))
const n = pals.length

// Upper-triangle matrix of child indexes, one entry per unordered pair (i <= j).
const children = new Array((n * (n + 1)) / 2).fill(-1)
const genderSpecific = []

function pairIndex(i, j) {
  if (i > j) [i, j] = [j, i]
  return i * n - (i * (i - 1)) / 2 + (j - i)
}

for (const entry of breeding.Breeding) {
  const a = palIndex.get(entry.Parent1InternalName)
  const b = palIndex.get(entry.Parent2InternalName)
  const c = palIndex.get(entry.ChildInternalName)
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error(`Unknown pal in breeding entry: ${JSON.stringify(entry)}`)
  }
  if (entry.Parent1Gender === 'WILDCARD' && entry.Parent2Gender === 'WILDCARD') {
    children[pairIndex(a, b)] = c
  } else {
    genderSpecific.push({
      a,
      aGender: entry.Parent1Gender === 'MALE' ? 'M' : 'F',
      b,
      bGender: entry.Parent2Gender === 'MALE' ? 'M' : 'F',
      child: c,
    })
  }
}

// Gender-specific pairs have no wildcard entry; fall back to the first listed
// outcome so pair lookups always resolve, and let the engine override it.
for (const g of genderSpecific) {
  const idx = pairIndex(g.a, g.b)
  if (children[idx] === -1) children[idx] = g.child
}

const missing = children.filter((c) => c === -1).length
if (missing > 0) throw new Error(`${missing} pal pairs have no breeding result`)

const passives = db.PassiveSkills.filter((s) => s.IsStandardPassiveSkill)
  .map((s) => ({
    id: s.InternalName,
    name: s.Name,
    rank: s.Rank,
    description: s.Description ?? '',
    randomAllowed: s.RandomInheritanceAllowed,
  }))
  .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))

const out = {
  source: {
    repo: 'https://github.com/tylercamp/palcalc',
    ref,
    dbVersion: db.Version,
    builtAt: new Date().toISOString(),
  },
  mechanics: {
    // probability of inheriting exactly N passives from the parents' pool
    inheritCount: normalizeWeights(db.BreedingMechanics.PassiveInheritanceWeights),
    // probability of N random passives being added on top
    randomCount: normalizeWeights(db.BreedingMechanics.PassiveRandomWeights),
  },
  pals,
  passives,
  children,
  genderSpecific,
}

await writeFile(outPath, JSON.stringify(out))
console.log(`Wrote ${outPath}: ${pals.length} pals, ${passives.length} passives, ${children.length} pairs (db ${db.Version})`)

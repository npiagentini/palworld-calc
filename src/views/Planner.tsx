import { useMemo, useState } from 'react'
import { PalPicker, PassivePicker } from '../components/Pickers'
import { type OwnedPal, useOwnedPals } from '../db'
import { parentsOf, type Gender } from '../engine/gameData'
import { flattenSteps, oneStepChildren, planAll, type OwnedRef, type PlanNode } from '../engine/pathfinder'
import { genderSymbol, palName } from '../format'
import { useWildSettings, type WildSettings } from '../settings'
import { PassivePlan } from './PassivePlan'

function parentLabel(node: PlanNode, byKey: Map<number, OwnedPal>, gender?: Gender): string {
  const name = palName(node.palId)
  const g = gender ? ` ${genderSymbol(gender)}` : ''
  if (node.kind === 'bred') return `${name}${g} (bred above)`
  const owners = [...new Set(node.owned.map((o) => byKey.get(o.key)?.owner).filter(Boolean))]
  return `${name}${g} (owned${owners.length ? `, ${owners.join(' / ')}` : ''})`
}

/** Gender a bred parent must be rolled as, when its partner is owned in only one gender. */
function neededGender(node: PlanNode, partner: PlanNode, fixed?: Gender): Gender | undefined {
  if (fixed || node.kind !== 'bred' || partner.kind !== 'owned') return fixed
  const genders = new Set(partner.owned.map((o) => o.gender))
  if (genders.size !== 1) return undefined
  return genders.has('M') ? 'F' : 'M'
}

function WildPanel(props: { wild: WildSettings; onChange: (w: WildSettings) => void }) {
  const { wild, onChange } = props
  return (
    <div className="wild-panel">
      <div className="segmented small">
        <button type="button" className={wild.enabled ? 'active' : ''} onClick={() => onChange({ ...wild, enabled: true })}>
          Use wild catches
        </button>
        <button type="button" className={wild.enabled ? '' : 'active'} onClick={() => onChange({ ...wild, enabled: false })}>
          Owned pals only
        </button>
      </div>
      {wild.enabled && (
        <div className="wild-fields">
          <label>
            One catch is worth
            <span className="stepper">
              <button type="button" onClick={() => onChange({ ...wild, catchCost: Math.max(1, wild.catchCost - 1) })}>
                -
              </button>
              <strong>{wild.catchCost}</strong>
              <button type="button" onClick={() => onChange({ ...wild, catchCost: Math.min(50, wild.catchCost + 1) })}>
                +
              </button>
            </span>
            eggs
          </label>
          <label>
            Highest wild level I can reach
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              placeholder="no limit"
              value={wild.maxLevel ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                onChange({ ...wild, maxLevel: Number.isFinite(v) && v > 0 ? v : undefined })
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              className="check"
              checked={!!wild.includeLegendaries}
              onChange={(e) => onChange({ ...wild, includeLegendaries: e.target.checked })}
            />
            Include legendaries
          </label>
        </div>
      )}
    </div>
  )
}

/** Breeding routes from what you own to a target Pal, optionally with passives. */
export function Planner() {
  const pals = useOwnedPals()
  const [target, setTarget] = useState<string>()
  const [passives, setPassives] = useState<string[]>([])
  const [wild, setWild] = useWildSettings()
  const wildOptions = wild.enabled
    ? { catchCost: wild.catchCost, maxLevel: wild.maxLevel, includeLegendaries: wild.includeLegendaries }
    : undefined
  // the egg-cost solver handles passives and catches; the instant species router handles neither
  const useSolver = passives.length > 0 || wild.enabled

  const refs: OwnedRef[] = useMemo(() => pals.map((p) => ({ key: p.id, palId: p.palId, gender: p.gender })), [pals])
  const byKey = useMemo(() => new Map(pals.map((p) => [p.id, p])), [pals])
  const plans = useMemo(() => planAll(refs), [refs])
  const now = useMemo(() => oneStepChildren(refs), [refs])

  const plan = target ? plans.get(target) : undefined
  const steps = plan ? flattenSteps(plan) : []

  return (
    <div>
      <label>Target Pal</label>
      <PalPicker value={target} onChange={setTarget} placeholder="Which Pal do you want to breed?" />
      <label>Passives it should have (optional, up to 4)</label>
      <PassivePicker value={passives} onChange={setPassives} />

      <WildPanel wild={wild} onChange={setWild} />

      {target && useSolver && <PassivePlan target={target} passives={passives} pals={pals} byKey={byKey} wild={wildOptions} />}

      {target && !useSolver && !plan && (
        <div className="result">
          <p className="warn">You can't reach {palName(target)} from your current pals.</p>
          <p className="muted">These pairs produce it. Catching one of these parents is a good start:</p>
          <ul className="pairs">
            {parentsOf(target)
              .slice(0, 30)
              .map((p, i) => (
                <li key={i}>
                  {palName(p.a)}
                  {p.genders ? ` ${genderSymbol(p.genders.a)}` : ''} + {palName(p.b)}
                  {p.genders ? ` ${genderSymbol(p.genders.b)}` : ''}
                </li>
              ))}
          </ul>
        </div>
      )}

      {!useSolver && plan && plan.kind === 'owned' && <p className="result">You already own a {palName(plan.palId)}.</p>}

      {!useSolver && plan && steps.length > 0 && (
        <div className="result">
          <h3>
            {palName(target!)} in {steps.length} breeding step{steps.length === 1 ? '' : 's'}
          </h3>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={i}>
                {parentLabel(s.parentA, byKey, neededGender(s.parentA, s.parentB, s.genders?.[0]))} +{' '}
                {parentLabel(s.parentB, byKey, neededGender(s.parentB, s.parentA, s.genders?.[1]))}
                {' = '}
                <strong>{palName(s.child)}</strong>
                {s.parentA.palId === s.parentB.palId && s.parentA.kind === 'bred' && (
                  <span className="muted"> (breed one of each gender first)</span>
                )}
              </li>
            ))}
          </ol>
          <p className="muted">
            Fewest breeding steps from pals you own. Add passives or turn on wild catches for an egg-cost plan.
          </p>
        </div>
      )}

      <h3>Breedable right now ({now.length})</h3>
      <div className="chips">
        {now.map((n) => (
          <button key={n.child} type="button" className="chip" onClick={() => setTarget(n.child)}>
            {palName(n.child)}
          </button>
        ))}
        {now.length === 0 && <span className="muted">Add a male and a female pal to see options.</span>}
      </div>
      <p className="muted">{plans.size} species reachable in total from your pals.</p>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { PassiveChip } from '../components/Pickers'
import type { OwnedPal } from '../db'
import type { Gender } from '../engine/gameData'
import { solveInWorker, type SolveJob } from '../engine/solveAsync'
import { solveSteps, type SolveNode, type SolveResult } from '../engine/solver'
import { genderSymbol, palName, percent } from '../format'

interface Options {
  targetGender?: Gender
  allowExtra: boolean
  thorough: boolean
}

function eggCount(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n))
}

function nodeKey(n: SolveNode): string {
  return `${n.palId}|${n.gender}|${n.passives.join()}|${n.extra}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a'
}

function ParentCell(props: { node: SolveNode; byKey: Map<number, OwnedPal>; stepOf: Map<string, number> }) {
  const { node } = props
  const g = node.gender ? ` ${genderSymbol(node.gender)}` : ''
  if (node.kind === 'owned') {
    const owned = props.byKey.get(node.key)
    return (
      <div className="plan-pal">
        <div>
          <strong>
            {palName(node.palId)}
            {g}
          </strong>{' '}
          <span className="muted">
            owned{owned?.owner ? ` by ${owned.owner}` : ''}
            {owned?.nickname ? `, ${owned.nickname}` : ''}
          </span>
        </div>
        <div className="chips">
          {(owned?.passives ?? node.passives).map((p) => (
            <PassiveChip key={p} id={p} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="plan-pal">
      <div>
        <strong>
          {palName(node.palId)}
          {g}
        </strong>{' '}
        <span className="muted">from step {props.stepOf.get(nodeKey(node))}</span>
      </div>
      <div className="chips">
        {node.passives.map((p) => (
          <PassiveChip key={p} id={p} />
        ))}
      </div>
    </div>
  )
}

function PlanView(props: { plan: SolveNode; byKey: Map<number, OwnedPal> }) {
  const { plan } = props
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setDoneSteps((d) => {
      const next = new Set(d)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  if (plan.kind === 'owned') {
    const owned = props.byKey.get(plan.key)
    return (
      <p className="result">
        {owned?.owner ?? 'You'} already {owned?.owner ? 'has' : 'have'} a {palName(plan.palId)} with these passives.
      </p>
    )
  }
  const steps = solveSteps(plan)
  const stepOf = new Map(steps.map((s, i) => [nodeKey(s.node), i + 1]))
  return (
    <div className="result">
      <h3>
        {steps.length} step{steps.length === 1 ? '' : 's'}, about {eggCount(plan.totalEggs)} eggs in total
      </h3>
      <ol className="plan-steps">
        {steps.map((s, i) => {
          const isFinal = i === steps.length - 1
          const name = palName(s.node.palId)
          const { passives, extra } = s.node
          return (
            <li key={i} className={`${isFinal ? 'final' : ''}${doneSteps.has(i) ? ' done' : ''}`}>
              <div className="plan-pair">
                <ParentCell node={s.parents[0]} byKey={props.byKey} stepOf={stepOf} />
                <span className="plus">+</span>
                <ParentCell node={s.parents[1]} byKey={props.byKey} stepOf={stepOf} />
              </div>
              <div className="plan-child">
                Keep breeding until you get {article(name)}{' '}
                <strong>
                  {name}
                  {s.node.gender ? ` ${genderSymbol(s.node.gender)}` : ''}
                </strong>{' '}
                {passives.length === 0 ? (
                  extra === 0 ? (
                    'with no passives.'
                  ) : (
                    `with ${plural(extra, 'passive')} (any).`
                  )
                ) : (
                  <>
                    with{' '}
                    {passives.map((p) => (
                      <PassiveChip key={p} id={p} />
                    ))}{' '}
                    {extra === 0 ? 'and no other passives.' : `and ${plural(extra, 'other passive')}.`}
                  </>
                )}
                <div className="step-foot">
                  <span className="muted">
                    {percent(s.node.probability)} per egg, about {eggCount(s.node.eggs)} eggs
                  </span>
                  <button type="button" className={`chip${doneSteps.has(i) ? ' active' : ''}`} onClick={() => toggle(i)}>
                    {doneSteps.has(i) ? 'Done' : 'Mark done'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="muted">
        Egg counts are averages: keep hatching from the same pair until the result matches. Parents are not used up, so a pal can
        appear in more than one step.
      </p>
    </div>
  )
}

/** Runs the species + passives solver for a target and shows the plan. */
export function PassivePlan(props: { target: string; passives: string[]; pals: OwnedPal[]; byKey: Map<number, OwnedPal> }) {
  const [options, setOptions] = useState<Options>({ allowExtra: false, thorough: false })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SolveResult>()
  const [error, setError] = useState('')
  const job = useRef<SolveJob>(undefined)

  // a new question invalidates the old answer
  const signature = JSON.stringify([props.target, props.passives, options, props.pals.map((p) => [p.id, p.palId, p.gender, p.passives])])
  const [answeredFor, setAnsweredFor] = useState('')
  const stale = answeredFor !== signature

  useEffect(() => () => job.current?.cancel(), [])

  const run = async () => {
    job.current?.cancel()
    setRunning(true)
    setError('')
    setResult(undefined)
    const j = solveInWorker({
      owned: props.pals.map((p) => ({ key: p.id, palId: p.palId, gender: p.gender, passives: p.passives })),
      target: props.target,
      passives: props.passives,
      targetGender: options.targetGender,
      maxExtra: options.allowExtra ? 4 : 0,
      ...(options.thorough ? { maxCarrierExtra: 4, maxBridgeExtra: 4, timeLimitMs: 90_000 } : { timeLimitMs: 20_000 }),
    })
    job.current = j
    try {
      setResult(await j.promise)
      setAnsweredFor(signature)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      if (job.current === j) {
        job.current = undefined
        setRunning(false)
      }
    }
  }

  const cancel = () => {
    job.current?.cancel()
    job.current = undefined
    setRunning(false)
  }

  const missing = props.passives.filter((p) => !props.pals.some((o) => o.passives.includes(p)))

  return (
    <div>
      <label>Final pal gender</label>
      <div className="segmented small">
        {([undefined, 'M', 'F'] as const).map((g) => (
          <button
            key={g ?? 'any'}
            type="button"
            className={options.targetGender === g ? 'active' : ''}
            onClick={() => setOptions((o) => ({ ...o, targetGender: g }))}
          >
            {g === undefined ? 'Either' : g === 'M' ? 'Male' : 'Female'}
          </button>
        ))}
      </div>
      <div className="segmented small">
        <button
          type="button"
          className={options.allowExtra ? '' : 'active'}
          onClick={() => setOptions((o) => ({ ...o, allowExtra: false }))}
        >
          Only these passives
        </button>
        <button
          type="button"
          className={options.allowExtra ? 'active' : ''}
          onClick={() => setOptions((o) => ({ ...o, allowExtra: true }))}
        >
          Extras are fine
        </button>
      </div>
      <div className="segmented small">
        <button type="button" className={options.thorough ? '' : 'active'} onClick={() => setOptions((o) => ({ ...o, thorough: false }))}>
          Quick search
        </button>
        <button type="button" className={options.thorough ? 'active' : ''} onClick={() => setOptions((o) => ({ ...o, thorough: true }))}>
          Thorough (slower)
        </button>
      </div>

      {missing.length > 0 && (
        <p className="warn">
          None of your pals has{' '}
          {missing.map((p) => (
            <PassiveChip key={p} id={p} />
          ))}
          . Catch or add one that does first.
        </p>
      )}

      <div className="actions">
        <button type="button" className="primary" disabled={running || missing.length > 0} onClick={run}>
          {running ? 'Searching...' : 'Find breeding plan'}
        </button>
        {running && (
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>

      {error && <p className="warn">Search failed: {error}</p>}
      {result && stale && !running && <p className="muted">Inputs changed since this plan was made. Search again to update it.</p>}
      {result?.status === 'unreachable' && (
        <p className="result warn">No plan reaches {palName(props.target)} with these passives from your current pals.</p>
      )}
      {result?.status === 'timeout' && (
        <p className="result warn">The search ran out of time before finding a plan. Try fewer passives or the quick search.</p>
      )}
      {result?.status === 'partial' && (
        <p className="warn">Time ran out. This is the best plan found, but a cheaper one may exist.</p>
      )}
      {/* keyed per answer so 'done' marks reset with a new plan */}
      {result?.plan && <PlanView key={answeredFor} plan={result.plan} byKey={props.byKey} />}
      {result && (
        <p className="muted small">
          Searched {result.statesExplored.toLocaleString()} options in {(result.ms / 1000).toFixed(1)} s.
        </p>
      )}
    </div>
  )
}

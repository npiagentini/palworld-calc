import { useMemo, useState, type ReactNode } from 'react'
import { PassiveChip } from '../components/Pickers'
import { useOwnedPals } from '../db'
import { breed, getPal, getPassive, type Gender } from '../engine/gameData'
import { passiveOdds } from '../engine/passives'
import { eggs, genderSymbol, palName, percent } from '../format'
import { PalRow } from './MyPals'

/** Pick two owned pals and see the child and passive odds. */
export function BreedCalc() {
  const pals = useOwnedPals()
  const [aId, setAId] = useState<number>()
  const [bId, setBId] = useState<number>()
  // null means "every positive passive in the pool", recomputed as parents change
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [wantGender, setWantGender] = useState<Gender | ''>('')

  const a = pals.find((p) => p.id === aId)
  const b = pals.find((p) => p.id === bId)
  const pool = useMemo(() => [...new Set([...(a?.passives ?? []), ...(b?.passives ?? [])])], [a, b])

  const desired = chosen ?? pool.filter((id) => (getPassive(id)?.rank ?? 0) > 0)

  const sorted = [...pals].sort((x, y) => palName(x.palId).localeCompare(palName(y.palId)))
  const pick = (id: number) => {
    setChosen(null)
    if (aId === id) setAId(undefined)
    else if (bId === id) setBId(undefined)
    else if (aId === undefined) setAId(id)
    else setBId(id)
  }

  let result: ReactNode = <p className="muted">Tap two pals below to pair them.</p>
  if (a && b) {
    if (a.gender === b.gender) {
      result = <p className="warn">Both pals are {a.gender === 'M' ? 'male' : 'female'}. Breeding needs one of each.</p>
    } else {
      const child = breed(a.palId, b.palId, a.gender, b.gender)
      const male = getPal(child).maleChance
      const genderP = wantGender === 'M' ? male : wantGender === 'F' ? 1 - male : 1
      const odds = passiveOdds(a.passives, b.passives, desired)
      result = (
        <div className="result">
          <h3>
            {palName(a.palId)} {genderSymbol(a.gender)} + {palName(b.palId)} {genderSymbol(b.gender)} = {palName(child)}
          </h3>
          <p className="muted">
            Child is male {percent(male)} / female {percent(1 - male)}
          </p>
          <label>Passives you want on the child (tap to toggle)</label>
          <div className="chips">
            {pool.map((id) => (
              <PassiveChip
                key={id}
                id={id}
                active={desired.includes(id)}
                onClick={() => setChosen(desired.includes(id) ? desired.filter((x) => x !== id) : [...desired, id])}
              />
            ))}
            {pool.length === 0 && <span className="muted">Neither parent has passives.</span>}
          </div>
          <label>Child gender</label>
          <div className="segmented small">
            {(['', 'M', 'F'] as const).map((g) => (
              <button key={g} type="button" className={wantGender === g ? 'active' : ''} onClick={() => setWantGender(g)}>
                {g === '' ? 'Any' : g === 'M' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
          <table className="odds">
            <tbody>
              <tr>
                <td>Has all {desired.length} wanted passives</td>
                <td>{percent(odds.containsAll * genderP)}</td>
                <td>{eggs(odds.containsAll * genderP)}</td>
              </tr>
              <tr>
                <td>Has only those (no junk)</td>
                <td>{percent(odds.exactly * genderP)}</td>
                <td>{eggs(odds.exactly * genderP)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )
    }
  }

  return (
    <div>
      {result}
      <h3>Your pals</h3>
      <div className="list">
        {sorted.map((p) => (
          <PalRow key={p.id} pal={p} selected={p.id === aId || p.id === bId} onClick={() => pick(p.id)} />
        ))}
        {pals.length === 0 && <p className="empty">Add some pals first.</p>}
      </div>
    </div>
  )
}

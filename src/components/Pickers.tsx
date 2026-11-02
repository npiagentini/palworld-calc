import { useMemo, useState } from 'react'
import { gameData, getPassive, type Gender, type PassiveSkill } from '../engine/gameData'
import { genderSymbol, palName, passiveName, rankClass } from '../format'

const MAX_RESULTS = 40

/** Search-as-you-type species picker. */
export function PalPicker(props: { value?: string; onChange: (palId: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(!props.value)
  // focus the search when the user re-opens the picker, so the iPad keyboard comes up
  const [reopened, setReopened] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? gameData.pals.filter((p) => p.name.toLowerCase().includes(q) || String(p.dex) === q)
      : gameData.pals
    return list.slice(0, MAX_RESULTS)
  }, [query])

  if (!open && props.value) {
    return (
      <button type="button" className="picked" onClick={() => {
          setOpen(true)
          setReopened(true)
        }}>
        {palName(props.value)} <span className="muted">change</span>
      </button>
    )
  }

  return (
    <div className="picker">
      <input
        type="search"
        autoFocus={props.autoFocus || reopened}
        placeholder={props.placeholder ?? 'Search Pal name or Paldeck number'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="picker-list">
        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={p.id === props.value ? 'selected' : ''}
              onClick={() => {
                props.onChange(p.id)
                setQuery('')
                setOpen(false)
              }}
            >
              <span className="dex">#{p.dex}</span> {p.name}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="muted">No match</li>}
      </ul>
    </div>
  )
}

export function PassiveChip(props: { id: string; onRemove?: () => void; onClick?: () => void; active?: boolean }) {
  const p = getPassive(props.id)
  const cls = `chip ${rankClass(p?.rank ?? 0)}${props.active ? ' active' : ''}`
  const label = passiveName(props.id)
  if (props.onRemove) {
    return (
      <button type="button" className={cls} onClick={props.onRemove} title={p?.description}>
        {label} <span aria-label="remove">x</span>
      </button>
    )
  }
  if (props.onClick) {
    return (
      <button type="button" className={cls} onClick={props.onClick} title={p?.description}>
        {label}
      </button>
    )
  }
  return (
    <span className={cls} title={p?.description}>
      {label}
    </span>
  )
}

/** Pick up to `max` passives, good ones listed first. */
export function PassivePicker(props: { value: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const max = props.max ?? 4
  const [query, setQuery] = useState('')
  const full = props.value.length >= max

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list: PassiveSkill[] = q
      ? gameData.passives.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      : gameData.passives.filter((p) => p.rank >= 3)
    return list.filter((p) => !props.value.includes(p.id)).slice(0, MAX_RESULTS)
  }, [query, props.value])

  return (
    <div className="passive-picker">
      <div className="chips">
        {props.value.map((id) => (
          <PassiveChip key={id} id={id} onRemove={() => props.onChange(props.value.filter((x) => x !== id))} />
        ))}
        {props.value.length === 0 && <span className="muted">No passives</span>}
      </div>
      {!full && (
        <>
          <input
            type="search"
            placeholder="Search passives (empty shows the good ones)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chips scroll">
            {matches.map((p) => (
              <PassiveChip
                key={p.id}
                id={p.id}
                onClick={() => {
                  props.onChange([...props.value, p.id])
                  setQuery('')
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function GenderToggle(props: { value: Gender; onChange: (g: Gender) => void }) {
  return (
    <div className="segmented">
      {(['M', 'F'] as const).map((g) => (
        <button
          key={g}
          type="button"
          className={props.value === g ? 'active' : ''}
          onClick={() => props.onChange(g)}
        >
          {genderSymbol(g)} {g === 'M' ? 'Male' : 'Female'}
        </button>
      ))}
    </div>
  )
}

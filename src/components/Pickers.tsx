import { useMemo, useState } from 'react'
import { gameData, getPassive, type Gender, type PassiveSkill } from '../engine/gameData'
import { genderSymbol, palName, passiveName, rankClass } from '../format'

const MAX_RESULTS = 40

/** Search-as-you-type species picker. */
export function PalPicker(props: {
  value?: string
  onChange: (palId: string) => void
  placeholder?: string
  autoFocus?: boolean
  /** Text to start the search with, e.g. what was typed in My Pals' filter. */
  initialQuery?: string
}) {
  const [query, setQuery] = useState(props.initialQuery ?? '')
  // the value the user tapped "change" on; a new value from outside (e.g. the
  // planner search bar) closes the list again
  const [editingFrom, setEditingFrom] = useState<string | null>(null)
  const editing = !!props.value && editingFrom === props.value

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? gameData.pals.filter((p) => p.name.toLowerCase().includes(q) || String(p.dex) === q)
      : gameData.pals
    return list.slice(0, MAX_RESULTS)
  }, [query])

  if (props.value && !editing) {
    return (
      <button type="button" className="picked" onClick={() => setEditingFrom(props.value!)}>
        {palName(props.value)} <span className="muted">change</span>
      </button>
    )
  }

  return (
    <div className="picker">
      <input
        type="search"
        // focus when re-opened, so the iPad keyboard comes up
        autoFocus={props.autoFocus || editing}
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
                setEditingFrom(null)
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

const PASSIVE_GROUPS: { label: string; test: (rank: number) => boolean }[] = [
  { label: 'Best', test: (r) => r >= 4 },
  { label: 'Good', test: (r) => r === 3 },
  { label: 'Minor', test: (r) => r >= 0 && r <= 2 },
  { label: 'Negative', test: (r) => r < 0 },
]

/** Pick up to `max` passives. Every passive is listed, grouped by tier; search narrows it down. */
export function PassivePicker(props: { value: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const max = props.max ?? 4
  const [query, setQuery] = useState('')
  const full = props.value.length >= max

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list: PassiveSkill[] = gameData.passives.filter(
      (p) => !props.value.includes(p.id) && (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    )
    return PASSIVE_GROUPS.map((g) => ({ label: g.label, items: list.filter((p) => g.test(p.rank)) })).filter((g) => g.items.length > 0)
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
            placeholder="Search passives by name or effect (e.g. work speed)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="passive-groups">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="group-label">{g.label}</div>
                <div className="chips">
                  {g.items.map((p) => (
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
              </div>
            ))}
            {groups.length === 0 && <span className="muted">No passive matches "{query}"</span>}
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

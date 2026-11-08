import { useState, type FormEvent } from 'react'
import { parseQuery, type ParsedQuery } from '../engine/query'
import { genderSymbol, palName } from '../format'
import { PassiveChip } from './Pickers'

/** Free-text planner request: "Anubis with Artisan", typed or dictated. */
export function QuerySearch(props: { onSearch: (q: ParsedQuery) => void }) {
  const [text, setText] = useState('')
  const [last, setLast] = useState<ParsedQuery>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const q = parseQuery(text)
    setLast(q)
    if (q.target || q.passives.length > 0) props.onSearch(q)
    // drop the iPad keyboard so the plan is visible
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  return (
    <div className="query-search">
      <form className="toolbar" onSubmit={submit}>
        <input
          type="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder='Try "Anubis with Artisan"'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="primary">
          Plan it
        </button>
      </form>
      {last && (
        <div className="query-feedback">
          {last.target || last.passives.length > 0 ? (
            <div>
              <span className="muted">Understood: </span>
              {last.target ? (
                <strong>
                  {palName(last.target)}
                  {last.gender ? ` ${genderSymbol(last.gender)}` : ''}
                </strong>
              ) : (
                <span className="warn">no Pal named</span>
              )}
              {last.passives.length > 0 && <span className="muted"> with </span>}
              {last.passives.map((p) => (
                <PassiveChip key={p} id={p} />
              ))}
            </div>
          ) : (
            <div className="warn">Didn't recognise a Pal or passive in that.</div>
          )}
          {last.unknown.length > 0 && <div className="warn">Didn't recognise: {last.unknown.join(', ')}</div>}
          {last.dropped.length > 0 && (
            <div className="warn">
              Only 4 passives fit, so these were left out:{' '}
              {last.dropped.map((p) => (
                <PassiveChip key={p} id={p} />
              ))}
            </div>
          )}
          {last.extraSpecies.length > 0 && (
            <div className="muted">Planning for the first Pal named; ignored {last.extraSpecies.map(palName).join(', ')}.</div>
          )}
          {!last.target && last.passives.length > 0 && <div className="muted">Pick a target Pal below to plan.</div>}
        </div>
      )}
    </div>
  )
}

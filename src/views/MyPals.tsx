import { useMemo, useState } from 'react'
import { GenderToggle, PalPicker, PassiveChip, PassivePicker } from '../components/Pickers'
import { addPal, deletePal, updatePal, type NewOwnedPal, type OwnedPal, useOwnedPals } from '../db'
import { getPal } from '../engine/gameData'
import { genderSymbol, palName, passiveName } from '../format'

function emptyPal(owner: string): NewOwnedPal {
  return { palId: '', gender: 'F', passives: [], nickname: '', owner, notes: '' }
}

function PalForm(props: { initial: NewOwnedPal; owners: string[]; onSave: (p: NewOwnedPal) => void; onCancel: () => void; onDelete?: () => void }) {
  const [pal, setPal] = useState(props.initial)
  const set = <K extends keyof NewOwnedPal>(k: K, v: NewOwnedPal[K]) => setPal((p) => ({ ...p, [k]: v }))

  return (
    <div className="sheet">
      <h2>{props.onDelete ? 'Edit Pal' : 'Add Pal'}</h2>
      <label>Species</label>
      <PalPicker
        autoFocus={!pal.palId}
        value={pal.palId || undefined}
        onChange={(palId) => {
          // pre-fill passives some species always spawn with
          const guaranteed = getPal(palId).guaranteedPassives
          setPal((p) => ({ ...p, palId, passives: p.passives.length === 0 ? guaranteed.slice(0, 4) : p.passives }))
        }}
      />
      <label>Gender</label>
      <GenderToggle value={pal.gender} onChange={(g) => set('gender', g)} />
      <label>Passives (up to 4)</label>
      <PassivePicker value={pal.passives} onChange={(v) => set('passives', v)} />
      <label>Owner</label>
      <div className="segmented">
        {props.owners.map((o) => (
          <button key={o} type="button" className={pal.owner === o ? 'active' : ''} onClick={() => set('owner', o)}>
            {o}
          </button>
        ))}
      </div>
      <label>Nickname / where it is (optional)</label>
      <input value={pal.nickname} onChange={(e) => set('nickname', e.target.value)} placeholder="e.g. Base 2 palbox" />
      <div className="actions">
        <button type="button" className="primary" disabled={!pal.palId} onClick={() => props.onSave(pal)}>
          Save
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        {props.onDelete && (
          <button type="button" className="danger" onClick={props.onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

export function PalRow(props: { pal: OwnedPal; onClick?: () => void; selected?: boolean }) {
  const { pal } = props
  return (
    <button type="button" className={`pal-row${props.selected ? ' selected' : ''}`} onClick={props.onClick}>
      <div className="pal-row-head">
        <span className={`gender g-${pal.gender}`}>{genderSymbol(pal.gender)}</span>
        <strong>{palName(pal.palId)}</strong>
        {pal.nickname && <span className="muted">{pal.nickname}</span>}
        <span className="owner">{pal.owner}</span>
      </div>
      <div className="chips">
        {pal.passives.map((p) => (
          <PassiveChip key={p} id={p} />
        ))}
      </div>
    </button>
  )
}

export function MyPals(props: { owners: string[] }) {
  const pals = useOwnedPals()
  const [editing, setEditing] = useState<OwnedPal | 'new' | null>(null)
  const [filter, setFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<string>('')

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return pals
      .filter((p) => !ownerFilter || p.owner === ownerFilter)
      .filter(
        (p) =>
          !q ||
          palName(p.palId).toLowerCase().includes(q) ||
          p.nickname.toLowerCase().includes(q) ||
          p.passives.some((s) => passiveName(s).toLowerCase().includes(q)),
      )
      .sort((a, b) => palName(a.palId).localeCompare(palName(b.palId)) || b.createdAt - a.createdAt)
  }, [pals, filter, ownerFilter])

  if (editing) {
    const initial = editing === 'new' ? emptyPal(ownerFilter || props.owners[0]) : editing
    return (
      <PalForm
        initial={initial}
        owners={props.owners}
        onCancel={() => setEditing(null)}
        onSave={async (p) => {
          if (editing === 'new') await addPal(p)
          else await updatePal(editing.id, p)
          setEditing(null)
        }}
        onDelete={
          editing === 'new'
            ? undefined
            : async () => {
                if (confirm(`Delete ${palName(editing.palId)}?`)) {
                  await deletePal(editing.id)
                  setEditing(null)
                }
              }
        }
      />
    )
  }

  return (
    <div>
      <div className="toolbar">
        <input type="search" placeholder="Filter by name or passive" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          + Add Pal
        </button>
      </div>
      <div className="segmented small">
        <button type="button" className={!ownerFilter ? 'active' : ''} onClick={() => setOwnerFilter('')}>
          Everyone
        </button>
        {props.owners.map((o) => (
          <button key={o} type="button" className={ownerFilter === o ? 'active' : ''} onClick={() => setOwnerFilter(o)}>
            {o}
          </button>
        ))}
      </div>
      <p className="muted">{shown.length} of {pals.length} pals</p>
      <div className="list">
        {shown.map((p) => (
          <PalRow key={p.id} pal={p} onClick={() => setEditing(p)} />
        ))}
        {pals.length === 0 && <p className="empty">No pals yet. Add the ones with passives worth passing on.</p>}
      </div>
    </div>
  )
}

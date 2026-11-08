import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { countImportedPals, replaceImportedPals } from '../db'
import { readPalCalcCsv, type PalCalcImport as ImportResult } from '../import/palcalcCsv'

const SHARED = 'Shared'
const KEEP = '__keep__'
const MAPPING_KEY = 'palworld-calc.importOwners'

/** Owner choices from the last import, so they only need setting once. */
function rememberedMapping(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function ownerLabel(owner: string): string {
  return owner || '(no owner in save)'
}

/** Default player for a save owner: last import's choice, a player with the same name, else keep the save's name. */
function defaultMapping(owner: string, players: string[], remembered: Record<string, string>): string {
  const before = remembered[owner]
  if (before && (before === KEEP || before === SHARED || players.includes(before))) return before
  if (!owner) return SHARED
  const same = players.find((p) => p.toLowerCase() === owner.toLowerCase())
  return same ?? KEEP
}

/** Import every pal from PalCalc's "Export Save CSV", replacing the previous import. */
export function PalCalcImport(props: { owners: string[]; setOwners: (o: string[]) => void }) {
  const imported = useLiveQuery(() => countImportedPals(), []) ?? 0
  const [preview, setPreview] = useState<ImportResult>()
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    setMessage('')
    try {
      const result = readPalCalcCsv(await file.text())
      setPreview(result)
      const remembered = rememberedMapping()
      setMapping(Object.fromEntries([...result.owners.keys()].map((o) => [o, defaultMapping(o, props.owners, remembered)])))
    } catch (e) {
      setPreview(undefined)
      setMessage(`Could not read that file: ${(e as Error).message}`)
    }
  }

  const ownerFor = (owner: string) => (mapping[owner] === KEEP ? owner : mapping[owner]) || SHARED

  const confirm = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const pals = preview.pals.map((p) => ({
        palId: p.palId,
        gender: p.gender,
        passives: p.passives,
        nickname: p.location,
        owner: ownerFor(p.owner),
        notes: '',
        level: p.level,
      }))
      const { removed, added } = await replaceImportedPals(pals)
      localStorage.setItem(MAPPING_KEY, JSON.stringify({ ...rememberedMapping(), ...mapping }))
      // make new owner names selectable as players
      const names = [...new Set(pals.map((p) => p.owner))]
      const missing = names.filter((n) => !props.owners.includes(n))
      if (missing.length > 0) props.setOwners([...props.owners, ...missing])
      setMessage(`Imported ${plural(added, 'pal')}${removed > 0 ? `, replacing ${removed} from the last import` : ''}.`)
      setPreview(undefined)
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h3>Import from PalCalc</h3>
      <p className="muted">
        On the PC that hosts the world, open PalCalc, select the save, and use <strong>Export Save CSV</strong> (best with the game
        closed). Send the file to this device and pick it here. Each import replaces the pals from the previous one; pals you added by
        hand are kept. {imported > 0 && `${imported} pals on this device came from the last import.`}
      </p>
      <label className="button">
        Choose PalCalc CSV
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
      </label>

      {preview && (
        <div className="result import-preview">
          <h3>
            {plural(preview.pals.length, 'pal')} found{preview.skipped > 0 ? `, ${preview.skipped} skipped` : ''}
          </h3>
          <table className="odds">
            <tbody>
              {[...preview.owners.entries()].map(([owner, count]) => (
                <tr key={owner}>
                  <td>
                    {ownerLabel(owner)} <span className="muted">({count})</span>
                  </td>
                  <td>
                    <select value={mapping[owner]} onChange={(e) => setMapping((m) => ({ ...m, [owner]: e.target.value }))}>
                      {owner && <option value={KEEP}>Keep as "{owner}"</option>}
                      {[...new Set([...props.owners, SHARED])].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.unknownSpecies.size > 0 && (
            <p className="warn">
              Skipped Pals the app doesn't know (newer than its game data?): {[...preview.unknownSpecies.keys()].join(', ')}
            </p>
          )}
          {preview.unknownPassives.size > 0 && (
            <p className="muted">
              Passives not in the game data, kept by name: {[...preview.unknownPassives.keys()].join(', ')}
            </p>
          )}
          {imported > 0 && <p className="muted">This replaces the {plural(imported, 'pal')} from your last import.</p>}
          <div className="actions">
            <button type="button" className="primary" disabled={busy || preview.pals.length === 0} onClick={confirm}>
              Import {plural(preview.pals.length, 'pal')}
            </button>
            <button type="button" onClick={() => setPreview(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className="result">{message}</p>}
    </div>
  )
}

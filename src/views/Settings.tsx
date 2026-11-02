import { useState } from 'react'
import { exportBackup, importBackup } from '../db'
import { gameData } from '../engine/gameData'

async function shareOrDownload(json: string) {
  const name = `palworld-calc-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([json], name, { type: 'application/json' })
  // iPad: the share sheet lets you save to Files / iCloud Drive or AirDrop it
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Palworld Calc backup' })
    return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Settings(props: { owners: string[]; setOwners: (o: string[]) => void }) {
  const [ownersText, setOwnersText] = useState(props.owners.join(', '))
  const [message, setMessage] = useState('')

  const onImport = async (file: File, replace: boolean) => {
    try {
      const count = await importBackup(await file.text(), replace)
      setMessage(`Imported ${count} pals.`)
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="settings">
      <h3>Players</h3>
      <p className="muted">Comma separated. Used to tag who owns each pal.</p>
      <div className="toolbar">
        <input value={ownersText} onChange={(e) => setOwnersText(e.target.value)} />
        <button type="button" onClick={() => props.setOwners(ownersText.split(','))}>
          Save
        </button>
      </div>

      <h3>Backup and sharing</h3>
      <p className="muted">
        Your pals live only on this device. Export a backup now and then, or send it to the other player to import.
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={async () => {
            try {
              await shareOrDownload(await exportBackup())
            } catch (e) {
              if ((e as Error).name !== 'AbortError') setMessage(`Export failed: ${(e as Error).message}`)
            }
          }}
        >
          Export backup
        </button>
        <label className="button">
          Import (add to list)
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0], false)} />
        </label>
        <label className="button danger">
          Import (replace list)
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && confirm('Replace all pals on this device with the backup?')) onImport(f, true)
            }}
          />
        </label>
      </div>
      {message && <p className="result">{message}</p>}

      <h3>Game data</h3>
      <p className="muted">
        {gameData.pals.length} Pals and {gameData.passives.length} passives from{' '}
        <a href={gameData.source.repo} target="_blank" rel="noreferrer">
          PalCalc
        </a>{' '}
        (MIT), database {gameData.source.dbVersion}, built {gameData.source.builtAt.slice(0, 10)}.
      </p>
    </div>
  )
}

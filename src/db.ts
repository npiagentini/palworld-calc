import Dexie, { type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Gender } from './engine/gameData'

export interface OwnedPal {
  id: number
  palId: string
  gender: Gender
  passives: string[]
  nickname: string
  owner: string
  notes: string
  createdAt: number
}

export type NewOwnedPal = Omit<OwnedPal, 'id' | 'createdAt'>

export const db = new Dexie('palworld-calc') as Dexie & {
  pals: EntityTable<OwnedPal, 'id'>
}

db.version(1).stores({
  pals: '++id, palId, owner',
})

const NO_PALS: OwnedPal[] = []

/** All owned pals, live-updating. The array identity only changes when the data does. */
export function useOwnedPals(): OwnedPal[] {
  return useLiveQuery(() => db.pals.toArray(), []) ?? NO_PALS
}

export async function addPal(pal: NewOwnedPal): Promise<number> {
  return db.pals.add({ ...pal, createdAt: Date.now() } as OwnedPal)
}

export async function updatePal(id: number, changes: Partial<NewOwnedPal>): Promise<void> {
  await db.pals.update(id, changes)
}

export async function deletePal(id: number): Promise<void> {
  await db.pals.delete(id)
}

const BACKUP_FORMAT = 'palworld-calc-backup'

export async function exportBackup(): Promise<string> {
  const pals = await db.pals.toArray()
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), pals }, null, 2)
}

/** Imports a backup. `replace` wipes the current list first; otherwise pals are appended. */
export async function importBackup(json: string, replace: boolean): Promise<number> {
  const data = JSON.parse(json)
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.pals)) throw new Error('Not a Palworld Calc backup file')
  const pals = (data.pals as OwnedPal[]).map(({ id: _id, ...rest }) => rest)
  await db.transaction('rw', db.pals, async () => {
    if (replace) await db.pals.clear()
    await db.pals.bulkAdd(pals as OwnedPal[])
  })
  return pals.length
}

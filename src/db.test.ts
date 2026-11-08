import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPal, countImportedPals, db, exportBackup, importBackup, replaceImportedPals, type NewOwnedPal } from './db'

const mk = (palId: string, owner = 'Me'): NewOwnedPal => ({ palId, gender: 'M', passives: [], nickname: '', owner, notes: '' })

describe('replaceImportedPals', () => {
  beforeEach(async () => {
    await db.pals.clear()
  })

  it('adds imported pals tagged with their source', async () => {
    const r = await replaceImportedPals([mk('SheepBall'), mk('PinkCat')])
    expect(r).toEqual({ removed: 0, added: 2 })
    expect(await countImportedPals()).toBe(2)
  })

  it('replaces only previously imported pals and keeps hand-added ones', async () => {
    await addPal(mk('Anubis'))
    await replaceImportedPals([mk('SheepBall'), mk('PinkCat')])
    const r = await replaceImportedPals([mk('ChickenPal')])
    expect(r).toEqual({ removed: 2, added: 1 })
    const all = await db.pals.toArray()
    expect(all.map((p) => p.palId).sort()).toEqual(['Anubis', 'ChickenPal'])
    expect(all.find((p) => p.palId === 'Anubis')!.source).toBeUndefined()
  })

  it('keeps the source tag through a backup round trip', async () => {
    await replaceImportedPals([mk('SheepBall')])
    const json = await exportBackup()
    await importBackup(json, true)
    expect(await countImportedPals()).toBe(1)
  })
})

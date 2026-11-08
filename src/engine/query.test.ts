import { describe, expect, it } from 'vitest'
import { gameData } from './gameData'
import { parseQuery } from './query'

const pal = (name: string) => gameData.pals.find((p) => p.name === name)!.id
const skill = (name: string) => gameData.passives.find((p) => p.name === name)!.id

describe('parseQuery', () => {
  it('reads "Anubis with Artisan"', () => {
    const q = parseQuery('Anubis with Artisan')
    expect(q.target).toBe(pal('Anubis'))
    expect(q.passives).toEqual([skill('Artisan')])
    expect(q.unknown).toEqual([])
  })

  it('reads gender and a list of passives with commas and "and"', () => {
    const q = parseQuery('Female anubis with swift, legend and runner')
    expect(q.target).toBe(pal('Anubis'))
    expect(q.gender).toBe('F')
    expect(q.passives).toEqual([skill('Swift'), skill('Legend'), skill('Runner')])
  })

  it('works without filler words', () => {
    const q = parseQuery('jormuntide artisan workaholic')
    expect(q.target).toBe(pal('Jormuntide'))
    expect(q.passives).toEqual([skill('Artisan'), skill('Workaholic')])
  })

  it('matches multi-word names containing filler words', () => {
    const q = parseQuery('anubis with heart of the immovable king and lord of the sea')
    expect(q.passives).toEqual([skill('Heart of the Immovable King'), skill('Lord of the Sea')])
    expect(q.unknown).toEqual([])
  })

  it('matches multi-word species and apostrophes', () => {
    const q = parseQuery("relaxaurus lux with world tree's bounty")
    expect(q.target).toBe(pal('Relaxaurus Lux'))
    expect(q.passives).toEqual([skill("World Tree's Bounty")])
  })

  it('tolerates typos and lowercase', () => {
    const q = parseQuery('anubus with artisen and workaholik')
    expect(q.target).toBe(pal('Anubis'))
    expect(q.passives).toEqual([skill('Artisan'), skill('Workaholic')])
  })

  it('accepts an unambiguous partial name', () => {
    expect(parseQuery('jormun with artisan').target).toBe(pal('Jormuntide'))
  })

  it('reads passives before the species too', () => {
    const q = parseQuery('swift legend anubis')
    expect(q.target).toBe(pal('Anubis'))
    expect(q.passives).toEqual([skill('Swift'), skill('Legend')])
  })

  it('reports words it does not know', () => {
    const q = parseQuery('anubis with zzzz power')
    expect(q.target).toBe(pal('Anubis'))
    expect(q.unknown).toEqual(['zzzz', 'power'])
  })

  it('keeps at most 4 passives and reports the rest', () => {
    const q = parseQuery('anubis swift legend runner nimble lucky')
    expect(q.passives).toHaveLength(4)
    expect(q.dropped).toEqual([skill('Lucky')])
  })

  it('ignores repeated passives and notes a second species', () => {
    const q = parseQuery('anubis swift swift lamball')
    expect(q.passives).toEqual([skill('Swift')])
    expect(q.extraSpecies).toEqual([pal('Lamball')])
  })

  it('handles dictation punctuation and gender symbols', () => {
    const q = parseQuery('Anubis ♂, with Artisan.')
    expect(q.gender).toBe('M')
    expect(q.passives).toEqual([skill('Artisan')])
  })

  it('returns nothing useful for an empty query', () => {
    const q = parseQuery('   ')
    expect(q.target).toBeUndefined()
    expect(q.passives).toEqual([])
  })
})

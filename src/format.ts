import { getPal, getPassive } from './engine/gameData'

export function palName(palId: string): string {
  return getPal(palId).name
}

export function passiveName(passiveId: string): string {
  return getPassive(passiveId)?.name ?? passiveId
}

export function rankClass(rank: number): string {
  if (rank >= 4) return 'rank-top'
  if (rank === 3) return 'rank-high'
  if (rank < 0) return 'rank-bad'
  return 'rank-normal'
}

export function percent(p: number): string {
  if (p <= 0) return '0%'
  if (p < 0.001) return '<0.1%'
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`
}

export function eggs(p: number): string {
  if (p <= 0) return 'impossible'
  const n = 1 / p
  return n < 10 ? `~${n.toFixed(1)} eggs` : `~${Math.round(n)} eggs`
}

export function genderLabel(g: 'M' | 'F'): string {
  return g === 'M' ? 'Male' : 'Female'
}

export function genderSymbol(g: 'M' | 'F'): string {
  return g === 'M' ? '♂' : '♀'
}

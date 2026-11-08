import { gameData, type Gender } from './gameData'
import { MAX_PASSIVES } from './passives'

export interface ParsedQuery {
  /** Target species id, if one was recognised. */
  target?: string
  /** Wanted passive ids, in the order given (at most 4). */
  passives: string[]
  gender?: Gender
  /** Words that matched nothing, as typed. */
  unknown: string[]
  /** Recognised passives beyond the first 4, which were dropped. */
  dropped: string[]
  /** Species named after the first one, which were ignored. */
  extraSpecies: string[]
}

interface Entry {
  kind: 'pal' | 'passive'
  id: string
  /** Normalised words of the name. */
  words: string[]
}

const GENDER_WORDS: Record<string, Gender> = {
  male: 'M',
  m: 'M',
  boy: 'M',
  '♂': 'M',
  female: 'F',
  f: 'F',
  girl: 'F',
  '♀': 'F',
}

// filler that can be dropped when it isn't part of a name
const STOPWORDS = new Set(
  'a an the with and also plus has have having that which who i want need get me make breed find of to for on in or passive passives skill skills trait traits'.split(
    ' ',
  ),
)

const MAX_NAME_WORDS = 5

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '') // world tree's -> world trees
    .replace(/[♂♀]/g, (s) => ` ${s} `)
    .replace(/[^a-z0-9♂♀]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

let entries: Entry[] | undefined
function allEntries(): Entry[] {
  if (!entries) {
    const seen = new Set<string>()
    entries = []
    for (const p of gameData.pals) {
      const key = p.name.toLowerCase()
      // a couple of names appear twice in the data; the first is the main species
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ kind: 'pal', id: p.id, words: normalise(p.name) })
    }
    for (const s of gameData.passives) entries.push({ kind: 'passive', id: s.id, words: normalise(s.name) })
  }
  return entries
}

/** Edit distance, capped: returns limit + 1 as soon as it is exceeded. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > limit) return limit + 1
    prev = cur
  }
  return prev[b.length]
}

/** Typos allowed for a name of this many letters. */
function tolerance(length: number): number {
  return length <= 4 ? 0 : length <= 8 ? 1 : 2
}

/**
 * Best entry for the words starting at `start`: exact names first, then a
 * unique name that starts with what was typed ("relaxa" -> Relaxaurus), then
 * small typos ("anubus" -> Anubis). Longer names win, so "Lord of the Sea" is
 * not read as "Lord" plus filler.
 */
function matchAt(tokens: string[], start: number, prefer: Entry['kind']): { entry: Entry; length: number } | undefined {
  const list = allEntries()
  const rank = (e: Entry) => (e.kind === prefer ? 0 : 1)
  for (let len = Math.min(MAX_NAME_WORDS, tokens.length - start); len >= 1; len--) {
    const phrase = tokens.slice(start, start + len).join(' ')
    const sameLength = list.filter((e) => e.words.length === len)

    const exact = sameLength.filter((e) => e.words.join(' ') === phrase).sort((a, b) => rank(a) - rank(b))
    if (exact.length > 0) return { entry: exact[0], length: len }

    // a partial last word only counts when it is unambiguous and not a filler word
    const last = tokens[start + len - 1]
    if (last.length >= 3 && !STOPWORDS.has(last)) {
      const head = tokens.slice(start, start + len - 1).join(' ')
      const prefixed = sameLength.filter((e) => e.words.slice(0, -1).join(' ') === head && e.words[len - 1].startsWith(last))
      if (prefixed.length === 1) return { entry: prefixed[0], length: len }
    }

    const allowed = tolerance(phrase.replace(/ /g, '').length)
    if (allowed > 0) {
      let best: Entry | undefined
      let bestDist = allowed + 1
      for (const e of sameLength) {
        const d = distance(phrase, e.words.join(' '), allowed)
        if (d < bestDist || (d === bestDist && best && rank(e) < rank(best))) {
          best = e
          bestDist = d
        }
      }
      if (best && bestDist <= allowed) return { entry: best, length: len }
    }
  }
  return undefined
}

/**
 * Reads requests like "female anubis with swift, legend and runner" or
 * "jormuntide artisan workaholic". The first species named is the target; the
 * passives can come in any order around it.
 */
export function parseQuery(text: string): ParsedQuery {
  const tokens = normalise(text)
  const result: ParsedQuery = { passives: [], unknown: [], dropped: [], extraSpecies: [] }

  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i]
    // gender and filler words are never the start of a name, so don't fuzzy-match them
    if (token in GENDER_WORDS) {
      result.gender = GENDER_WORDS[token]
      i++
      continue
    }
    if (STOPWORDS.has(token)) {
      i++
      continue
    }
    const match = matchAt(tokens, i, result.target ? 'passive' : 'pal')
    if (match) {
      const { entry, length } = match
      if (entry.kind === 'pal') {
        if (!result.target) result.target = entry.id
        else if (entry.id !== result.target) result.extraSpecies.push(entry.id)
      } else if (!result.passives.includes(entry.id) && !result.dropped.includes(entry.id)) {
        if (result.passives.length < MAX_PASSIVES) result.passives.push(entry.id)
        else result.dropped.push(entry.id)
      }
      i += length
      continue
    }
    result.unknown.push(token)
    i++
  }
  return result
}

import { unzipSync } from 'fflate'
import { decompress } from 'fzstd'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

/*
 * Reads an Anki deck package (.apkg) in the browser and keeps the text of each
 * note: the first field is the front, the other filled fields are the back.
 * Images and audio are left out. Loaded on demand (the import screen only).
 *
 * An .apkg is a zip with the collection as SQLite: collection.anki21b
 * (zstd-compressed, Anki 2.1.50+), collection.anki21 or collection.anki2.
 * Recent exports also carry a placeholder collection.anki2 asking to update
 * Anki, so the newest format is read first.
 */

export type AnkiCard = { front: string; back: string }
export type AnkiDeck = { name: string | null; cards: AnkiCard[] }

const fieldSeparator = '\x1f'

/** HTML of a field → plain text, keeping line breaks. */
function fieldText(html: string) {
  const withBreaks = html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n')
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? ''
  return text.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Cloze notes: the front hides each deletion, the back shows it. */
function clozeSides(text: string) {
  const pattern = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g
  return { front: text.replace(pattern, (_match, _answer, hint?: string) => hint ? `[${hint}]` : '[…]'), back: text.replace(pattern, (_match, answer: string) => answer) }
}

function noteCard(flds: string): AnkiCard | null {
  const fields = flds.split(fieldSeparator).map(fieldText)
  const [first = '', ...rest] = fields
  if (/\{\{c\d+::/.test(first)) {
    const { front, back } = clozeSides(first)
    const extra = rest.filter(Boolean).join('\n')
    return front ? { front, back: extra ? `${back}\n\n${extra}` : back } : null
  }
  const back = rest.filter(Boolean).join('\n')
  return first && back ? { front: first, back } : null
}

function collectionBytes(files: Record<string, Uint8Array>) {
  if (files['collection.anki21b']) return decompress(files['collection.anki21b'])
  return files['collection.anki21'] ?? files['collection.anki2'] ?? null
}

function deckName(db: import('sql.js').Database): string | null {
  const rows = (sql: string) => { try { return db.exec(sql)[0]?.values ?? [] } catch { return [] } }
  // Anki 2.1.28+: a decks table; nested decks use \x1f between levels.
  const named = rows('SELECT name FROM decks WHERE id IN (SELECT did FROM cards) LIMIT 1')[0]?.[0]
  if (typeof named === 'string') return named.split(fieldSeparator).join('::')
  // Older collections: decks as JSON in the col table.
  const json = rows('SELECT decks FROM col LIMIT 1')[0]?.[0]
  const used = rows('SELECT did FROM cards LIMIT 1')[0]?.[0]
  if (typeof json !== 'string') return null
  try {
    const decks = JSON.parse(json) as Record<string, { name?: string }>
    return decks[String(used)]?.name ?? null
  } catch { return null }
}

export async function readAnkiPackage(file: File): Promise<AnkiDeck> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const bytes = collectionBytes(files)
  if (!bytes) throw new Error('missing collection')
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  const db = new SQL.Database(bytes)
  try {
    const notes = db.exec('SELECT flds FROM notes ORDER BY id')[0]?.values ?? []
    const cards = notes.map(([flds]) => typeof flds === 'string' ? noteCard(flds) : null).filter((card): card is AnkiCard => Boolean(card))
    return { name: deckName(db), cards }
  } finally {
    db.close()
  }
}

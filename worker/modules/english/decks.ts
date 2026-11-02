import type { EnglishEnv } from './handler.js'

/*
 * Flashcard decks uploaded by learners (Anki .apkg). The browser reads the
 * file and sends only the text of each card; a deck is private to its owner
 * unless the owner makes it public for every learner.
 */

type Visibility = 'private' | 'public'
type DeckRow = { id: string; name: string; visibility: Visibility; mine: number; card_count: number; created_at: string }

const visibilities: Visibility[] = ['private', 'public']
const maxCards = 5000
const maxFieldLength = 4000
const maxNameLength = 120
// Cards go in through json_each, a few hundred kilobytes of JSON per statement (D1 caps a value at 2 MB).
const insertChunkBytes = 700_000

const unreadable = 'Não foi possível ler este arquivo do Anki.'
const notFound = 'Rota não encontrada.'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function visibleDeck(env: EnglishEnv, deckId: string, userId: string) {
  return env.ENGLISH_DB.prepare('SELECT id, owner_id FROM english_anki_decks WHERE id = ? AND (owner_id = ? OR visibility = \'public\')').bind(deckId, userId).first<{ id: string; owner_id: string }>()
}

/** Splits the cards into JSON arrays small enough for one statement each. */
function chunks(cards: { f: string; b: string; p: number }[]) {
  const result: string[] = []
  let current: typeof cards = []
  let size = 2
  for (const card of cards) {
    const cardSize = JSON.stringify(card).length * 3 + 1
    if (current.length && size + cardSize > insertChunkBytes) { result.push(JSON.stringify(current)); current = []; size = 2 }
    current.push(card); size += cardSize
  }
  if (current.length) result.push(JSON.stringify(current))
  return result
}

export async function handleEnglishDeckRequest(request: Request, env: EnglishEnv, user: { id: string }): Promise<Response | null> {
  const url = new URL(request.url)

  if (url.pathname === '/api/english/decks' && request.method === 'GET') {
    const { results } = await env.ENGLISH_DB.prepare('SELECT d.id, d.name, d.visibility, d.owner_id = ? AS mine, d.created_at, (SELECT COUNT(*) FROM english_anki_deck_cards c WHERE c.deck_id = d.id) AS card_count FROM english_anki_decks d WHERE d.owner_id = ? OR d.visibility = \'public\' ORDER BY d.created_at DESC')
      .bind(user.id, user.id).all<DeckRow>()
    return Response.json(results.map((deck) => ({ ...deck, mine: Boolean(deck.mine) })))
  }

  if (url.pathname === '/api/english/decks' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { name?: unknown; visibility?: unknown; cards?: unknown } | null
    const name = text(body?.name).slice(0, maxNameLength)
    const visibility = visibilities.find((value) => value === body?.visibility)
    if (!name || !visibility || !Array.isArray(body?.cards) || body.cards.length > maxCards) return Response.json({ error: unreadable }, { status: 400 })
    const cards = body.cards
      .map((card) => card && typeof card === 'object' ? { f: text((card as { front?: unknown }).front).slice(0, maxFieldLength), b: text((card as { back?: unknown }).back).slice(0, maxFieldLength) } : null)
      .filter((card): card is { f: string; b: string } => Boolean(card?.f && card.b))
      .map((card, position) => ({ ...card, p: position }))
    if (!cards.length) return Response.json({ error: 'Este baralho não tem cartões de texto.' }, { status: 400 })
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await env.ENGLISH_DB.batch([
      env.ENGLISH_DB.prepare('INSERT INTO english_anki_decks (id, owner_id, name, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user.id, name, visibility, now, now),
      ...chunks(cards).map((json) => env.ENGLISH_DB.prepare('INSERT INTO english_anki_deck_cards (id, deck_id, position, front, back) SELECT ? || \':\' || json_extract(value, \'$.p\'), ?, json_extract(value, \'$.p\'), json_extract(value, \'$.f\'), json_extract(value, \'$.b\') FROM json_each(?)').bind(id, id, json)),
    ])
    return Response.json({ id, name, visibility, mine: true, card_count: cards.length, created_at: now }, { status: 201 })
  }

  const cardsRoute = /^\/api\/english\/decks\/([0-9a-f-]{36})\/cards$/i.exec(url.pathname)
  if (cardsRoute && request.method === 'GET') {
    if (!await visibleDeck(env, cardsRoute[1], user.id)) return Response.json({ error: notFound }, { status: 404 })
    const { results } = await env.ENGLISH_DB.prepare('SELECT id, front, back FROM english_anki_deck_cards WHERE deck_id = ? ORDER BY position').bind(cardsRoute[1]).all<{ id: string; front: string; back: string }>()
    return Response.json(results)
  }

  const deckRoute = /^\/api\/english\/decks\/([0-9a-f-]{36})$/i.exec(url.pathname)
  if (deckRoute && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const deck = await visibleDeck(env, deckRoute[1], user.id)
    // Someone else's public deck answers like a missing one: only the owner changes or deletes it.
    if (!deck || deck.owner_id !== user.id) return Response.json({ error: notFound }, { status: 404 })
    if (request.method === 'DELETE') {
      await env.ENGLISH_DB.batch([
        env.ENGLISH_DB.prepare('DELETE FROM english_anki_deck_cards WHERE deck_id = ?').bind(deck.id),
        env.ENGLISH_DB.prepare('DELETE FROM english_anki_decks WHERE id = ?').bind(deck.id),
      ])
      return new Response(null, { status: 204 })
    }
    const body = await request.json().catch(() => null) as { visibility?: unknown } | null
    const visibility = visibilities.find((value) => value === body?.visibility)
    if (!visibility) return Response.json({ error: notFound }, { status: 400 })
    await env.ENGLISH_DB.prepare('UPDATE english_anki_decks SET visibility = ?, updated_at = ? WHERE id = ?').bind(visibility, new Date().toISOString(), deck.id).run()
    return Response.json({ id: deck.id, visibility })
  }

  return null
}

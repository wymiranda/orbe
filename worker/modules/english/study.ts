import type { EnglishEnv } from './handler.js'

/*
 * English flashcard progress for the shared flashcard engine. Same protocol as
 * the Chinese /api/study/progress: GET answers { cards, tombstones, vocabulary,
 * revisions } (`?meta=1` only the revisions); PUT takes the device outbox
 * { changes, vocabularyChanges }. One row per card; the newest change wins.
 */

type Card = { vocabularyId: string; dueAt: string; intervalDays: number; ease: number; isNew: boolean; updatedAt: number }
type Change = { op: 'upsert'; card: Card; learned: boolean } | { op: 'remove'; vocabularyId: string; deletedAt: number }
type VocabularyChange = { vocabularyId: string; status: 'learned' | 'unlearned'; updatedAt: number }
type CardRow = { card_id: string; due_at: string; interval_days: number; ease: number; is_new: number; is_learned: number; deleted_at: number | null; updated_at: number }

const maxChanges = 1_000
const maxIdLength = 200
// Removed cards are remembered as long as the devices keep their own tombstones.
const retentionMs = 183 * 86_400_000

function validId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= maxIdLength }
function validTimestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function validCard(value: unknown): value is Card { if (!value || typeof value !== 'object') return false; const c = value as Record<string, unknown>; return validId(c.vocabularyId) && typeof c.dueAt === 'string' && Number.isFinite(Date.parse(c.dueAt)) && typeof c.intervalDays === 'number' && Number.isInteger(c.intervalDays) && c.intervalDays >= 0 && c.intervalDays <= 36_500 && typeof c.ease === 'number' && Number.isFinite(c.ease) && c.ease >= 1 && c.ease <= 20 && typeof c.isNew === 'boolean' && validTimestamp(c.updatedAt) }
function validChange(value: unknown): value is Change { if (!value || typeof value !== 'object') return false; const c = value as Record<string, unknown>; return (c.op === 'upsert' && validCard(c.card) && typeof c.learned === 'boolean') || (c.op === 'remove' && validId(c.vocabularyId) && validTimestamp(c.deletedAt)) }
function validVocabularyChange(value: unknown): value is VocabularyChange { if (!value || typeof value !== 'object') return false; const c = value as Record<string, unknown>; return validId(c.vocabularyId) && (c.status === 'learned' || c.status === 'unlearned') && validTimestamp(c.updatedAt) }

async function revisions(env: EnglishEnv, userId: string) {
  const row = await env.ENGLISH_DB.prepare('SELECT COUNT(*) AS count, MAX(updated_at) AS latest FROM english_study_cards WHERE user_id = ?').bind(userId).first<{ count: number; latest: number | null }>()
  // Empty revisions tell a device the server has nothing yet, so it uploads its whole deck.
  return row?.count ? { english: row.latest ?? 0 } : {}
}

async function readProgress(env: EnglishEnv, userId: string) {
  const { results } = await env.ENGLISH_DB.prepare('SELECT card_id, due_at, interval_days, ease, is_new, is_learned, deleted_at, updated_at FROM english_study_cards WHERE user_id = ?').bind(userId).all<CardRow>()
  const { results: vocabulary } = await env.ENGLISH_DB.prepare('SELECT vocabulary_id, status, updated_at FROM english_vocabulary_progress WHERE user_id = ?').bind(userId).all<{ vocabulary_id: string; status: 'learned' | 'unlearned'; updated_at: number }>()
  const cutoff = Date.now() - retentionMs
  return {
    cards: results.filter((row) => row.deleted_at === null).map((row) => ({ vocabularyId: row.card_id, dueAt: row.due_at, intervalDays: row.interval_days, ease: row.ease, isNew: Boolean(row.is_new), learned: Boolean(row.is_learned), updatedAt: row.updated_at })),
    tombstones: results.filter((row) => row.deleted_at !== null && row.deleted_at >= cutoff).map((row) => ({ vocabularyId: row.card_id, deletedAt: row.deleted_at! })),
    vocabulary: vocabulary.map((row) => ({ vocabularyId: row.vocabulary_id, status: row.status, updatedAt: row.updated_at })),
    revisions: await revisions(env, userId),
  }
}

export async function handleEnglishStudyRequest(request: Request, env: EnglishEnv, user: { id: string } | undefined): Promise<Response> {
  if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
  const url = new URL(request.url)
  if (request.method === 'GET') return Response.json(url.searchParams.get('meta') === '1' ? { revisions: await revisions(env, user.id) } : await readProgress(env, user.id))
  if (request.method !== 'PUT') return Response.json({ error: 'Método não permitido.' }, { status: 405 })

  const body = await request.json().catch(() => null) as { changes?: unknown; vocabularyChanges?: unknown } | null
  const changes = Array.isArray(body?.changes) ? body.changes : []
  const vocabularyChanges = Array.isArray(body?.vocabularyChanges) ? body.vocabularyChanges : []
  if ((!changes.length && !vocabularyChanges.length) || changes.length > maxChanges || vocabularyChanges.length > maxChanges || !changes.every(validChange) || !vocabularyChanges.every(validVocabularyChange)) return Response.json({ error: 'Alterações de estudo inválidas.' }, { status: 400 })

  // The newest change of each card, as rows; a removal is a row with deleted_at set.
  const latest = new Map<string, Change>()
  for (const change of changes) { const id = change.op === 'remove' ? change.vocabularyId : change.card.vocabularyId; const current = latest.get(id); const at = change.op === 'remove' ? change.deletedAt : change.card.updatedAt; if (!current || at >= (current.op === 'remove' ? current.deletedAt : current.card.updatedAt)) latest.set(id, change) }
  const rows = [...latest.values()].map((change) => change.op === 'remove'
    ? { id: change.vocabularyId, dueAt: '', intervalDays: 0, ease: 0, isNew: 0, learned: 0, deletedAt: change.deletedAt, updatedAt: change.deletedAt }
    : { id: change.card.vocabularyId, dueAt: change.card.dueAt, intervalDays: change.card.intervalDays, ease: change.card.ease, isNew: change.card.isNew ? 1 : 0, learned: change.learned ? 1 : 0, deletedAt: null, updatedAt: change.card.updatedAt })
  const words = new Map<string, VocabularyChange>()
  for (const change of vocabularyChanges) { const current = words.get(change.vocabularyId); if (!current || change.updatedAt >= current.updatedAt) words.set(change.vocabularyId, change) }

  const statements: D1PreparedStatement[] = []
  // One statement per kind of change (json_each), whatever the size of the outbox.
  if (rows.length) statements.push(env.ENGLISH_DB.prepare(`INSERT INTO english_study_cards (user_id, card_id, due_at, interval_days, ease, is_new, is_learned, deleted_at, updated_at)
    SELECT ?1, json_extract(value, '$.id'), json_extract(value, '$.dueAt'), json_extract(value, '$.intervalDays'), json_extract(value, '$.ease'), json_extract(value, '$.isNew'), json_extract(value, '$.learned'), json_extract(value, '$.deletedAt'), json_extract(value, '$.updatedAt') FROM json_each(?2) WHERE true
    ON CONFLICT(user_id, card_id) DO UPDATE SET due_at = excluded.due_at, interval_days = excluded.interval_days, ease = excluded.ease, is_new = excluded.is_new, is_learned = excluded.is_learned, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
    WHERE excluded.updated_at > english_study_cards.updated_at`).bind(user.id, JSON.stringify(rows)))
  if (words.size) statements.push(env.ENGLISH_DB.prepare(`INSERT INTO english_vocabulary_progress (user_id, vocabulary_id, status, updated_at)
    SELECT ?1, json_extract(value, '$.vocabularyId'), json_extract(value, '$.status'), json_extract(value, '$.updatedAt') FROM json_each(?2) WHERE true
    ON CONFLICT(user_id, vocabulary_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
    WHERE excluded.updated_at >= english_vocabulary_progress.updated_at`).bind(user.id, JSON.stringify([...words.values()])))
  statements.push(env.ENGLISH_DB.prepare('DELETE FROM english_study_cards WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?').bind(user.id, Date.now() - retentionMs))
  await env.ENGLISH_DB.batch(statements)
  return Response.json({ ok: true, revisions: await revisions(env, user.id) })
}

import { constants, brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { currentUser } from '../../auth.js'

type StudyEnv = { DB: D1Database }
type AuthenticatedUser = { id: string }
type Card = { vocabularyId: string; dueAt: string; intervalDays: number; ease: number; isNew: boolean; updatedAt: number }
type Change = { op: 'upsert'; card: Card; learned: boolean } | { op: 'remove'; vocabularyId: string; deletedAt: number }
type VocabularyChange = { vocabularyId: string; status: 'learned' | 'unlearned'; updatedAt: number }
type State = [dueAtMinutes: number, intervalDays: number, easeX20: number, flags: number, updatedAt: number]
type Snapshot = { v: 2; g: Array<[State, number[]]> }
type Entry = { state: State }
type SnapshotRow = { hsk_level: string; payload: ArrayBuffer; updated_at: string; revision: number }
type LegacyRow = { vocabulary_id: string; numeric_id: number; hsk_level: string; due_at: string; interval_days: number; ease: number; review_count: number; is_learned: number; updated_at: string }
const tombstoneFlag = 4
const retentionMs = 183 * 86_400_000
const brotliOptions = { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }

function validCard(value: unknown): value is Card { if (!value || typeof value !== 'object') return false; const c = value as Record<string, unknown>; return typeof c.vocabularyId === 'string' && typeof c.dueAt === 'string' && Number.isFinite(Date.parse(c.dueAt)) && typeof c.intervalDays === 'number' && Number.isInteger(c.intervalDays) && c.intervalDays >= 0 && c.intervalDays <= 36_500 && typeof c.ease === 'number' && Number.isFinite(c.ease) && c.ease >= 1 && c.ease <= 20 && typeof c.isNew === 'boolean' && typeof c.updatedAt === 'number' && Number.isFinite(c.updatedAt) }
function validChange(value: unknown): value is Change { if (!value || typeof value !== 'object') return false; const c = value as Record<string, unknown>; return (c.op === 'upsert' && validCard(c.card) && typeof c.learned === 'boolean') || (c.op === 'remove' && typeof c.vocabularyId === 'string' && typeof c.deletedAt === 'number' && Number.isFinite(c.deletedAt)) }
function validVocabularyChange(value: unknown): value is VocabularyChange { if (!value || typeof value !== 'object') return false; const c = value as Record<string, unknown>; return typeof c.vocabularyId === 'string' && (c.status === 'learned' || c.status === 'unlearned') && typeof c.updatedAt === 'number' && Number.isFinite(c.updatedAt) }
function timestampFromIso(value: string) { return Date.parse(value) || 0 }
function stateFromCard(card: Card, learned: boolean): State { return [Math.floor(Date.parse(card.dueAt) / 60_000), card.intervalDays, Math.round(card.ease * 20), (card.isNew ? 1 : 0) | (learned ? 2 : 0), card.updatedAt] }
function tombstoneState(deletedAt: number): State { return [0, 0, 0, tombstoneFlag, deletedAt] }
function isTombstone(state: State) { return (state[3] & tombstoneFlag) !== 0 }
function decode(value: ArrayBuffer, fallbackUpdatedAt: number): Map<number, Entry> {
  const snapshot = JSON.parse(new TextDecoder().decode(brotliDecompressSync(new Uint8Array(value)))) as { v?: number; g?: unknown }
  const cards = new Map<number, Entry>()
  if (!Array.isArray(snapshot.g)) return cards
  for (const group of snapshot.g) {
    if (!Array.isArray(group) || !Array.isArray(group[0]) || !Array.isArray(group[1])) continue
    const raw = group[0]
    if ((snapshot.v !== 1 && snapshot.v !== 2) || (raw.length !== 4 && raw.length !== 5) || !raw.every((item) => typeof item === 'number' && Number.isFinite(item))) continue
    const state: State = raw.length === 5 ? raw as State : [...raw, fallbackUpdatedAt] as State
    for (const id of group[1]) if (typeof id === 'number' && Number.isInteger(id) && id > 0) cards.set(id, { state })
  }
  return cards
}
function encode(cards: Map<number, Entry>): Uint8Array {
  const groups = new Map<string, [State, number[]]>()
  for (const [id, { state }] of cards) { const key = state.join(','); const group = groups.get(key) ?? [state, []]; group[1].push(id); groups.set(key, group) }
  const snapshot: Snapshot = { v: 2, g: [...groups.values()].map(([state, ids]) => [state, ids.sort((a, b) => a - b)]) }
  return brotliCompressSync(new TextEncoder().encode(JSON.stringify(snapshot)), brotliOptions)
}
function prune(cards: Map<number, Entry>) { const cutoff = Date.now() - retentionMs; let changed = false; for (const [id, entry] of cards) if (isTombstone(entry.state) && entry.state[4] < cutoff) { cards.delete(id); changed = true }; return changed }
function newer(candidate: Entry, current: Entry | undefined) { return !current || candidate.state[4] > current.state[4] }

async function migrateLegacy(userId: string, env: StudyEnv) {
  if (await env.DB.prepare('SELECT 1 FROM user_study_snapshots WHERE user_id = ? LIMIT 1').bind(userId).first()) return
  const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_study_cards WHERE user_id = ?').bind(userId).first<{ count: number }>()
  const { results } = await env.DB.prepare(`SELECT cards.vocabulary_id, ids.numeric_id, catalogue.hsk_level, cards.due_at, cards.interval_days, cards.ease, cards.review_count, cards.is_learned, cards.updated_at FROM user_study_cards cards JOIN chinese_vocabulary_study_ids ids ON ids.vocabulary_id = cards.vocabulary_id JOIN chinese_vocabulary_catalog catalogue ON catalogue.id = cards.vocabulary_id WHERE cards.user_id = ?`).bind(userId).all<LegacyRow>()
  if (!results.length) return
  // Never create a partial snapshot and then discard unmapped legacy rows.
  if (results.length !== total?.count) return
  const selected = new Map<number, LegacyRow>(); const learned = new Set<number>()
  for (const row of results) { const current = selected.get(row.numeric_id); if (!current || row.review_count > current.review_count || (row.review_count === current.review_count && row.updated_at > current.updated_at)) selected.set(row.numeric_id, row); if (row.is_learned) learned.add(row.numeric_id) }
  const partitions = new Map<string, Map<number, Entry>>()
  for (const row of selected.values()) { const cards = partitions.get(row.hsk_level) ?? new Map<number, Entry>(); cards.set(row.numeric_id, { state: stateFromCard({ vocabularyId: row.vocabulary_id, dueAt: row.due_at, intervalDays: row.interval_days, ease: row.ease, isNew: row.review_count === 0, updatedAt: timestampFromIso(row.updated_at) }, learned.has(row.numeric_id)) }); partitions.set(row.hsk_level, cards) }
  const now = new Date().toISOString(); const last = results.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, results[0].updated_at)
  await env.DB.batch([...partitions].map(([hsk, cards]) => env.DB.prepare('INSERT INTO user_study_snapshots (user_id, hsk_level, payload, updated_at, last_studied_at, revision) VALUES (?, ?, ?, ?, ?, 1)').bind(userId, hsk, encode(cards), now, last)).concat(env.DB.prepare('DELETE FROM user_study_cards WHERE user_id = ?').bind(userId)))
}
async function mappings(changes: Change[], env: StudyEnv) {
  const ids = [...new Set(changes.map((change) => change.op === 'remove' ? change.vocabularyId : change.card.vocabularyId))]; const rows: Array<{ vocabulary_id: string; numeric_id: number; hsk_level: string }> = []
  for (let index = 0; index < ids.length; index += 100) { const batch = ids.slice(index, index + 100); const result = await env.DB.prepare(`SELECT ids.vocabulary_id, ids.numeric_id, catalogue.hsk_level FROM chinese_vocabulary_study_ids ids JOIN chinese_vocabulary_catalog catalogue ON catalogue.id = ids.vocabulary_id WHERE ids.vocabulary_id IN (${batch.map(() => '?').join(',')})`).bind(...batch).all<{ vocabulary_id: string; numeric_id: number; hsk_level: string }>(); rows.push(...result.results) }
  return new Map(rows.map((row) => [row.vocabulary_id, row]))
}
async function applyChanges(userId: string, changes: Change[], env: StudyEnv) {
  const latest = new Map<string, Change>(); for (const change of changes) latest.set(change.op === 'remove' ? change.vocabularyId : change.card.vocabularyId, change)
  const mapped = await mappings([...latest.values()], env); if (mapped.size !== latest.size) return false
  const partitions = new Map<string, Array<{ change: Change; numericId: number }>>()
  for (const [vocabularyId, change] of latest) { const mapping = mapped.get(vocabularyId)!; const list = partitions.get(mapping.hsk_level) ?? []; list.push({ change, numericId: mapping.numeric_id }); partitions.set(mapping.hsk_level, list) }
  const now = new Date().toISOString(); const statements: D1PreparedStatement[] = []
  for (const [hsk, list] of partitions) {
    const row = await env.DB.prepare('SELECT payload, updated_at FROM user_study_snapshots WHERE user_id = ? AND hsk_level = ?').bind(userId, hsk).first<{ payload: ArrayBuffer; updated_at: string }>()
    const cards = row ? decode(row.payload, timestampFromIso(row.updated_at)) : new Map<number, Entry>()
    let changed = false
    for (const { change, numericId } of list) { const candidate: Entry = { state: change.op === 'remove' ? tombstoneState(change.deletedAt) : stateFromCard(change.card, change.learned) }; if (newer(candidate, cards.get(numericId))) { cards.set(numericId, candidate); changed = true } }
    changed = prune(cards) || changed
    if (changed) statements.push(env.DB.prepare('INSERT INTO user_study_snapshots (user_id, hsk_level, payload, updated_at, last_studied_at, revision) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(user_id, hsk_level) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, last_studied_at = excluded.last_studied_at, revision = user_study_snapshots.revision + 1').bind(userId, hsk, encode(cards), now, now))
  }
  if (statements.length) await env.DB.batch(statements); return true
}
async function applyVocabularyChanges(userId: string, changes: VocabularyChange[], env: StudyEnv) {
  if (!changes.length) return true
  const latest = new Map<string, VocabularyChange>(); for (const change of changes) latest.set(change.vocabularyId, change)
  const ids = [...latest.keys()]
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100)
    const { results } = await env.DB.prepare(`SELECT id FROM chinese_vocabulary_catalog WHERE id IN (${batch.map(() => '?').join(',')})`).bind(...batch).all<{ id: string }>()
    if (results.length !== batch.length) return false
  }
  await env.DB.batch([...latest.values()].map((change) => env.DB.prepare("INSERT INTO user_vocabulary_progress (user_id, vocabulary_id, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, vocabulary_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at WHERE excluded.updated_at >= user_vocabulary_progress.updated_at").bind(userId, change.vocabularyId, change.status, change.updatedAt)))
  return true
}
async function readProgress(userId: string, env: StudyEnv) {
  await migrateLegacy(userId, env); const { results } = await env.DB.prepare('SELECT hsk_level, payload, updated_at, revision FROM user_study_snapshots WHERE user_id = ?').bind(userId).all<SnapshotRow>(); const entries = new Map<number, Entry>(); const revisions: Record<string, number> = {}
  for (const row of results) { revisions[row.hsk_level] = row.revision; for (const [id, entry] of decode(row.payload, timestampFromIso(row.updated_at))) entries.set(id, entry) }
  const { results: vocabularyProgress } = await env.DB.prepare('SELECT vocabulary_id, status, updated_at FROM user_vocabulary_progress WHERE user_id = ?').bind(userId).all<{ vocabulary_id: string; status: 'learned' | 'unlearned'; updated_at: number }>()
  const vocabularyStatus = vocabularyProgress.map((row) => ({ vocabularyId: row.vocabulary_id, status: row.status, updatedAt: row.updated_at }))
  if (!entries.size) return { cards: [], tombstones: [], vocabulary: vocabularyStatus, revisions }
  const { results: vocabulary } = await env.DB.prepare('SELECT numeric_id, vocabulary_id FROM chinese_vocabulary_study_ids').all<{ numeric_id: number; vocabulary_id: string }>(); const ids = new Map(vocabulary.map((row) => [row.numeric_id, row.vocabulary_id])); const cards: Array<Card & { learned: boolean }> = []; const tombstones: Array<{ vocabularyId: string; deletedAt: number }> = []
  for (const [id, { state }] of entries) { const vocabularyId = ids.get(id); if (!vocabularyId) continue; if (isTombstone(state)) tombstones.push({ vocabularyId, deletedAt: state[4] }); else cards.push({ vocabularyId, dueAt: new Date(state[0] * 60_000).toISOString(), intervalDays: state[1], ease: state[2] / 20, isNew: (state[3] & 1) !== 0, learned: (state[3] & 2) !== 0, updatedAt: state[4] }) }
  return { cards, tombstones, vocabulary: vocabularyStatus, revisions }
}
async function metadata(userId: string, env: StudyEnv) { await migrateLegacy(userId, env); const { results } = await env.DB.prepare('SELECT hsk_level, revision FROM user_study_snapshots WHERE user_id = ?').bind(userId).all<{ hsk_level: string; revision: number }>(); return { revisions: Object.fromEntries(results.map((row) => [row.hsk_level, row.revision])) } }
export async function purgeExpiredStudyProgress(env: StudyEnv) { const cutoff = new Date(Date.now() - retentionMs).toISOString(); const { results } = await env.DB.prepare('SELECT user_id FROM user_study_snapshots GROUP BY user_id HAVING MAX(last_studied_at) < ?').bind(cutoff).all<{ user_id: string }>(); if (results.length) await env.DB.batch(results.map(({ user_id }) => env.DB.prepare('DELETE FROM user_study_snapshots WHERE user_id = ?').bind(user_id))); await env.DB.prepare('DELETE FROM user_study_cards WHERE user_id IN (SELECT user_id FROM user_study_cards GROUP BY user_id HAVING MAX(updated_at) < ?)').bind(cutoff).run() }
export async function handleStudyRequest(request: Request, env: StudyEnv, authenticatedUser?: AuthenticatedUser): Promise<Response | null> {
  const url = new URL(request.url); if (url.pathname === '/api/study/decks' && request.method === 'GET') { const { results } = await env.DB.prepare('SELECT id, name, description FROM study_decks ORDER BY name COLLATE NOCASE').all(); return Response.json(results) }; if (url.pathname !== '/api/study/progress') return null
  const user = authenticatedUser ?? await currentUser(request, env); if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
  if (request.method === 'GET') return Response.json(url.searchParams.get('meta') === '1' ? await metadata(user.id, env) : await readProgress(user.id, env))
  // "Limpar todo histórico": the learner's whole study history kept on the server.
  if (request.method === 'DELETE') { await env.DB.batch(['user_study_snapshots', 'user_study_cards', 'user_vocabulary_progress', 'user_study_session_logs'].map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id))); return Response.json({ ok: true }) }
  if (request.method !== 'PUT') return Response.json({ error: 'Método não permitido.' }, { status: 405 })
  const body = await request.json().catch(() => null) as { changes?: unknown; vocabularyChanges?: unknown } | null
  const changes = Array.isArray(body?.changes) ? body.changes : []
  const vocabularyChanges = Array.isArray(body?.vocabularyChanges) ? body.vocabularyChanges : []
  if ((!changes.length && !vocabularyChanges.length) || changes.length > 1_000 || vocabularyChanges.length > 1_000 || !changes.every(validChange) || !vocabularyChanges.every(validVocabularyChange)) return Response.json({ error: 'Alterações de estudo inválidas.' }, { status: 400 })
  await migrateLegacy(user.id, env)
  if (!await applyChanges(user.id, changes, env) || !await applyVocabularyChanges(user.id, vocabularyChanges, env)) return Response.json({ error: 'Vocabulário de estudo inválido.' }, { status: 400 })
  return Response.json({ ok: true, revisions: await metadata(user.id, env) })
}

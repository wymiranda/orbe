/**
 * Flashcard progress kept on the device, shared by every language. Each
 * workspace opens its own store (storage key + change event); the scheduling,
 * the sync outbox and the daily activity work the same for all of them.
 */
export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type DeviceCard = { vocabularyId: string; dueAt: string; intervalDays: number; ease: number; isNew: boolean; updatedAt: number }
/**
 * Cards and presentations are counted apart: one card may be presented several
 * times a day. `newCards` holds the cards introduced by the deck that day.
 */
export type DailyStudyActivity = { reviews: number; retained: number; learned: number; presentations?: number; cards?: string[]; newCards?: string[] }
export type StudySyncChange = { op: 'upsert'; card: DeviceCard; learned: boolean } | { op: 'remove'; vocabularyId: string; deletedAt: number }
export type VocabularySyncChange = { vocabularyId: string; status: 'learned' | 'unlearned'; updatedAt: number }
export type RemoteStudyProgress = { cards: Array<DeviceCard & { learned: boolean }>; tombstones: Array<{ vocabularyId: string; deletedAt: number }>; vocabulary: VocabularySyncChange[]; revisions: Record<string, number> }
export type DeviceProgress = {
  vocabulary: Record<string, 'learning' | 'learned'>
  cards: DeviceCard[]
  readingChapter: Record<string, string>
  readingProgress: Record<string, number>
  activity: Record<string, DailyStudyActivity>
  studySync: Record<string, StudySyncChange>
  studyTombstones: Record<string, number>
  studyRevisions: Record<string, number>
  vocabularySync: Record<string, VocabularySyncChange>
}

const retentionMs = 183 * 86_400_000
export const emptyProgress = (): DeviceProgress => ({ vocabulary: {}, cards: [], readingChapter: {}, readingProgress: {}, activity: {}, studySync: {}, studyTombstones: {}, studyRevisions: {}, vocabularySync: {} })
type LegacyCard = Partial<DeviceCard> & { reviewCount?: unknown; updatedAt?: unknown }

function validCard(value: unknown): value is DeviceCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  return typeof card.vocabularyId === 'string' && typeof card.dueAt === 'string' && typeof card.intervalDays === 'number' && typeof card.ease === 'number' && typeof card.isNew === 'boolean' && typeof card.updatedAt === 'number' && Number.isFinite(card.updatedAt)
}
function validChange(value: unknown): value is StudySyncChange {
  if (!value || typeof value !== 'object') return false
  const change = value as Record<string, unknown>
  return (change.op === 'upsert' && validCard(change.card) && typeof change.learned === 'boolean') || (change.op === 'remove' && typeof change.vocabularyId === 'string' && typeof change.deletedAt === 'number')
}
function validVocabularyChange(value: unknown): value is VocabularySyncChange { if (!value || typeof value !== 'object') return false; const change = value as Record<string, unknown>; return typeof change.vocabularyId === 'string' && (change.status === 'learned' || change.status === 'unlearned') && typeof change.updatedAt === 'number' && Number.isFinite(change.updatedAt) }
function cardTimestamp(card: LegacyCard) {
  if (typeof card.updatedAt === 'number' && Number.isFinite(card.updatedAt)) return card.updatedAt
  if (typeof card.updatedAt === 'string') return Date.parse(card.updatedAt) || 0
  return 0
}
function normalizeCards(value: unknown): DeviceCard[] {
  if (!Array.isArray(value)) return []
  const byVocabulary = new Map<string, DeviceCard>()
  for (const valueCard of value) {
    if (!valueCard || typeof valueCard !== 'object') continue
    const legacy = valueCard as LegacyCard
    if (typeof legacy.vocabularyId !== 'string' || typeof legacy.dueAt !== 'string' || typeof legacy.intervalDays !== 'number' || typeof legacy.ease !== 'number') continue
    const reviews = typeof legacy.reviewCount === 'number' ? legacy.reviewCount : legacy.isNew ? 0 : 1
    const card: DeviceCard = { vocabularyId: legacy.vocabularyId, dueAt: legacy.dueAt, intervalDays: legacy.intervalDays, ease: legacy.ease, isNew: typeof legacy.isNew === 'boolean' ? legacy.isNew : reviews === 0, updatedAt: cardTimestamp(legacy) }
    const current = byVocabulary.get(card.vocabularyId)
    if (!current || card.updatedAt > current.updatedAt || (card.updatedAt === current.updatedAt && reviews > 0 && current.isNew)) byVocabulary.set(card.vocabularyId, card)
  }
  return [...byVocabulary.values()]
}
function pruneTombstones(tombstones: Record<string, number>) {
  const cutoff = Date.now() - retentionMs
  for (const [id, deletedAt] of Object.entries(tombstones)) if (!Number.isFinite(deletedAt) || deletedAt < cutoff) delete tombstones[id]
}

/** Reads a stored progress object, upgrading older shapes; anything unreadable becomes empty progress. */
export function parseProgress(stored: string | null): DeviceProgress {
  try {
    const parsed = JSON.parse(stored ?? '') as Partial<DeviceProgress>
    const cards = normalizeCards(parsed.cards)
    const storedChanges = parsed.studySync && typeof parsed.studySync === 'object' ? Object.entries(parsed.studySync).filter(([, change]) => validChange(change)) : []
    const hadOutbox = Object.prototype.hasOwnProperty.call(parsed, 'studySync')
    const studySync = hadOutbox ? Object.fromEntries(storedChanges) : Object.fromEntries(cards.map((card) => [card.vocabularyId, { op: 'upsert' as const, card, learned: parsed.vocabulary?.[card.vocabularyId] === 'learned' }]))
    const studyTombstones = parsed.studyTombstones && typeof parsed.studyTombstones === 'object' ? Object.fromEntries(Object.entries(parsed.studyTombstones).filter(([, value]) => typeof value === 'number')) as Record<string, number> : {}
    pruneTombstones(studyTombstones)
    const cardsWithoutTombstones = cards.filter((card) => !(studyTombstones[card.vocabularyId] >= card.updatedAt))
    const studyRevisions = parsed.studyRevisions && typeof parsed.studyRevisions === 'object' ? Object.fromEntries(Object.entries(parsed.studyRevisions).filter(([, value]) => typeof value === 'number')) as Record<string, number> : {}
    const storedVocabularyChanges = parsed.vocabularySync && typeof parsed.vocabularySync === 'object' ? Object.entries(parsed.vocabularySync).filter(([, change]) => validVocabularyChange(change)) : []
    const vocabularySync = Object.prototype.hasOwnProperty.call(parsed, 'vocabularySync') ? Object.fromEntries(storedVocabularyChanges) : Object.fromEntries(Object.entries(parsed.vocabulary ?? {}).filter(([, status]) => status === 'learned').map(([vocabularyId]) => [vocabularyId, { vocabularyId, status: 'learned' as const, updatedAt: Date.now() }]))
    const readingProgress = parsed.readingProgress && typeof parsed.readingProgress === 'object' ? Object.fromEntries(Object.entries(parsed.readingProgress).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)) as Record<string, number> : {}
    return { vocabulary: parsed.vocabulary ?? {}, cards: cardsWithoutTombstones, readingChapter: parsed.readingChapter ?? {}, readingProgress, activity: parsed.activity ?? {}, studySync, studyTombstones, studyRevisions, vocabularySync }
  } catch { return emptyProgress() }
}

function queueUpsert(progress: DeviceProgress, card: DeviceCard) { delete progress.studyTombstones[card.vocabularyId]; progress.studySync[card.vocabularyId] = { op: 'upsert', card: { ...card }, learned: progress.vocabulary[card.vocabularyId] === 'learned' } }
export function pendingStudyChanges(progress: DeviceProgress) { return Object.values(progress.studySync) }
export function pendingVocabularyChanges(progress: DeviceProgress) { return Object.values(progress.vocabularySync) }
export function queueCompleteStudyState(progress: DeviceProgress) {
  for (const card of progress.cards) queueUpsert(progress, card)
  for (const [vocabularyId, deletedAt] of Object.entries(progress.studyTombstones)) progress.studySync[vocabularyId] = { op: 'remove', vocabularyId, deletedAt }
}
export function mergeRemoteStudyProgress(progress: DeviceProgress, remote: RemoteStudyProgress) {
  pruneTombstones(progress.studyTombstones)
  const localCards = new Map(progress.cards.map((card) => [card.vocabularyId, card]))
  const tombstones = { ...progress.studyTombstones }
  for (const tombstone of remote.tombstones) if ((tombstones[tombstone.vocabularyId] ?? -1) < tombstone.deletedAt) tombstones[tombstone.vocabularyId] = tombstone.deletedAt
  for (const remoteCard of remote.cards) {
    const deletedAt = tombstones[remoteCard.vocabularyId] ?? -1
    const local = localCards.get(remoteCard.vocabularyId)
    if (remoteCard.updatedAt > deletedAt && (!local || remoteCard.updatedAt >= local.updatedAt)) {
      localCards.set(remoteCard.vocabularyId, remoteCard)
      if (remoteCard.learned) progress.vocabulary[remoteCard.vocabularyId] = 'learned'
    }
  }
  for (const [id, deletedAt] of Object.entries(tombstones)) { const card = localCards.get(id); if (card && card.updatedAt <= deletedAt) localCards.delete(id) }
  progress.cards = [...localCards.values()]
  progress.studyTombstones = tombstones
  progress.studyRevisions = remote.revisions
  for (const change of remote.vocabulary) {
    if (progress.vocabularySync[change.vocabularyId]) continue
    if (change.status === 'learned') progress.vocabulary[change.vocabularyId] = 'learned'
    else delete progress.vocabulary[change.vocabularyId]
  }
}

function today() { return new Date().toISOString().slice(0, 10) }
export function recordStudyActivity(progress: DeviceProgress, changes: Partial<Pick<DailyStudyActivity, 'reviews' | 'retained' | 'learned'>>) { const date = today(); const current = progress.activity[date] ?? { reviews: 0, retained: 0, learned: 0 }; progress.activity[date] = { ...current, reviews: current.reviews + (changes.reviews ?? 0), retained: current.retained + (changes.retained ?? 0), learned: current.learned + (changes.learned ?? 0) } }
function withCard(ids: string[] | undefined, vocabularyId: string) { return ids?.includes(vocabularyId) ? ids : [...(ids ?? []), vocabularyId] }
/** One flashcard shown; `introduced` when the deck presents it as a new card. */
export function recordCardPresentation(progress: DeviceProgress, vocabularyId: string, introduced = false) { const date = today(); const current = progress.activity[date] ?? { reviews: 0, retained: 0, learned: 0 }; progress.activity[date] = { ...current, presentations: (current.presentations ?? 0) + 1, cards: withCard(current.cards, vocabularyId), newCards: introduced ? withCard(current.newCards, vocabularyId) : current.newCards } }
export function newCardsIntroducedToday(progress: DeviceProgress) { return progress.activity[today()]?.newCards?.length ?? 0 }
export function nextReview(card: Pick<DeviceCard, 'intervalDays' | 'ease' | 'isNew'>, rating: Rating) {
  const base = card.intervalDays || 1
  // Keep the choices in their visual order: the harder it was to recall,
  // the sooner the card is shown again.
  const normalInterval = card.isNew ? 2 : Math.max(2, Math.round(base * card.ease))
  const hardInterval = card.isNew ? 1 : Math.max(1, normalInterval - Math.max(1, Math.round(base * .25)))
  let intervalDays = base
  let ease = card.ease
  if (rating === 'again') { intervalDays = 0; ease = Math.max(1.3, ease - 0.2) }
  if (rating === 'hard') { intervalDays = hardInterval; ease = Math.max(1.3, ease - 0.15) }
  if (rating === 'good') intervalDays = normalInterval
  if (rating === 'easy') { intervalDays = card.isNew ? 4 : Math.max(normalInterval + 1, Math.round(base * (card.ease + 1.3))); ease += 0.15 }
  return { intervalDays, ease, dueAt: new Date(Date.now() + (rating === 'again' ? 600000 : intervalDays * 86400000)).toISOString() }
}
export function setCardLearned(progress: DeviceProgress, vocabularyId: string) { const card = progress.cards.find((item) => item.vocabularyId === vocabularyId); if (!card) return; card.updatedAt = Date.now(); queueUpsert(progress, card) }
export function setVocabularyLearned(progress: DeviceProgress, vocabularyId: string) { progress.vocabulary[vocabularyId] = 'learned'; progress.vocabularySync[vocabularyId] = { vocabularyId, status: 'learned', updatedAt: Date.now() } }
export function unsetVocabularyLearned(progress: DeviceProgress, vocabularyId: string) { delete progress.vocabulary[vocabularyId]; progress.vocabularySync[vocabularyId] = { vocabularyId, status: 'unlearned', updatedAt: Date.now() } }
/** Adds cards that already have a review history (used when bringing older progress into the engine); no-op for cards in the deck. */
export function importCards(progress: DeviceProgress, cards: DeviceCard[]) { const existing = new Set(progress.cards.map((card) => card.vocabularyId)); const added = cards.filter((card) => !existing.has(card.vocabularyId)); progress.cards.push(...added); for (const card of added) queueUpsert(progress, card); return added.length }

export type ProgressStore = ReturnType<typeof createProgressStore>

/** The device progress of one workspace: `storageKey` in localStorage, `changeEvent` dispatched on every save. */
export function createProgressStore({ storageKey, changeEvent }: { storageKey: string; changeEvent: string }) {
  function load(): DeviceProgress { return parseProgress(window.localStorage.getItem(storageKey)) }
  function save(progress: DeviceProgress) { window.localStorage.setItem(storageKey, JSON.stringify(progress)); window.dispatchEvent(new Event(changeEvent)) }
  return {
    storageKey,
    changeEvent,
    load,
    save,
    acknowledgeStudyChanges(progress: DeviceProgress, sent: StudySyncChange[]) {
      for (const change of sent) { const key = change.op === 'remove' ? change.vocabularyId : change.card.vocabularyId; if (JSON.stringify(progress.studySync[key]) === JSON.stringify(change)) delete progress.studySync[key] }
      save(progress)
    },
    acknowledgeVocabularyChanges(progress: DeviceProgress, sent: VocabularySyncChange[]) { for (const change of sent) if (JSON.stringify(progress.vocabularySync[change.vocabularyId]) === JSON.stringify(change)) delete progress.vocabularySync[change.vocabularyId]; save(progress) },
    createCard(progress: DeviceProgress, vocabularyId: string) { if (progress.cards.some((card) => card.vocabularyId === vocabularyId)) return false; const card: DeviceCard = { vocabularyId, dueAt: new Date().toISOString(), intervalDays: 0, ease: 2.5, isNew: true, updatedAt: Date.now() }; progress.cards.push(card); queueUpsert(progress, card); save(progress); return true },
    createCardsForVocabulary(progress: DeviceProgress, vocabularyIds: string[]) { const existing = new Set(progress.cards.map((card) => card.vocabularyId)); const now = new Date().toISOString(); const updatedAt = Date.now(); const cards = [...new Set(vocabularyIds)].filter((id) => !existing.has(id)).map((vocabularyId) => ({ vocabularyId, dueAt: now, intervalDays: 0, ease: 2.5, isNew: true, updatedAt })); progress.cards.push(...cards); for (const card of cards) queueUpsert(progress, card); if (cards.length) save(progress); return cards.length },
    rateCard(progress: DeviceProgress, vocabularyId: string, rating: Rating) { const card = progress.cards.find((item) => item.vocabularyId === vocabularyId); if (!card) return null; const next = nextReview(card, rating); card.intervalDays = next.intervalDays; card.ease = next.ease; card.isNew = false; card.dueAt = next.dueAt; card.updatedAt = Date.now(); recordStudyActivity(progress, { reviews: 1, retained: rating === 'again' ? 0 : 1 }); queueUpsert(progress, card); save(progress); return card },
    removeCard(progress: DeviceProgress, vocabularyId: string) { const deletedAt = Date.now(); progress.cards = progress.cards.filter((card) => card.vocabularyId !== vocabularyId); progress.studyTombstones[vocabularyId] = deletedAt; progress.studySync[vocabularyId] = { op: 'remove', vocabularyId, deletedAt }; save(progress) },
  }
}

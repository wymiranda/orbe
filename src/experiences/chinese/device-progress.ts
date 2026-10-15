export type Rating = 'again' | 'hard' | 'good' | 'easy'

export type DeviceCard = { id: string; vocabularyId: string; sourceLineId: string | null; deckId: string | null; dueAt: string; intervalDays: number; ease: number; reviewCount: number; lapseCount: number; createdAt: string; updatedAt: string }
export type DeviceProgress = { vocabulary: Record<string, 'learning' | 'learned'>; cards: DeviceCard[]; readingChapter: Record<string, string> }

const storageKey = 'orbe:chinese-progress:v1'
const empty = (): DeviceProgress => ({ vocabulary: {}, cards: [], readingChapter: {} })

export function loadDeviceProgress(): DeviceProgress {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '') as Partial<DeviceProgress>
    return { vocabulary: parsed.vocabulary ?? {}, cards: parsed.cards ?? [], readingChapter: parsed.readingChapter ?? {} }
  } catch { return empty() }
}

export function saveDeviceProgress(progress: DeviceProgress) {
  window.localStorage.setItem(storageKey, JSON.stringify(progress))
  window.dispatchEvent(new Event('orbe:chinese-progress'))
}

export function createCard(progress: DeviceProgress, vocabularyId: string, sourceLineId: string | null, deckId: string | null = null) {
  if (progress.cards.some((card) => card.vocabularyId === vocabularyId && card.sourceLineId === sourceLineId && card.deckId === deckId)) return false
  const now = new Date().toISOString()
  progress.cards.push({ id: crypto.randomUUID(), vocabularyId, sourceLineId, deckId, dueAt: now, intervalDays: 0, ease: 2.5, reviewCount: 0, lapseCount: 0, createdAt: now, updatedAt: now })
  saveDeviceProgress(progress)
  return true
}

export function nextReview(card: Pick<DeviceCard, 'intervalDays' | 'ease' | 'reviewCount'>, rating: Rating) {
  const base = card.intervalDays || 1
  let intervalDays = base
  let ease = card.ease
  if (rating === 'again') { intervalDays = 0; ease = Math.max(1.3, ease - 0.2) }
  if (rating === 'hard') { intervalDays = Math.max(1, Math.round(base * 1.2)); ease = Math.max(1.3, ease - 0.15) }
  if (rating === 'good') intervalDays = card.reviewCount === 0 ? 1 : Math.max(1, Math.round(base * card.ease))
  if (rating === 'easy') { intervalDays = card.reviewCount === 0 ? 4 : Math.max(2, Math.round(base * (card.ease + 1.3))); ease += 0.15 }
  return { intervalDays, ease, dueAt: new Date(Date.now() + (rating === 'again' ? 600000 : intervalDays * 86400000)).toISOString() }
}

export function rateCard(progress: DeviceProgress, cardId: string, rating: Rating) {
  const card = progress.cards.find((item) => item.id === cardId)
  if (!card) return null
  const next = nextReview(card, rating)
  card.intervalDays = next.intervalDays; card.ease = next.ease; card.reviewCount += 1
  if (rating === 'again') card.lapseCount += 1
  card.dueAt = next.dueAt
  card.updatedAt = new Date().toISOString(); saveDeviceProgress(progress)
  return card
}

export function removeCard(progress: DeviceProgress, cardId: string) {
  progress.cards = progress.cards.filter((card) => card.id !== cardId)
  saveDeviceProgress(progress)
}

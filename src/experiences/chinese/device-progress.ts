import { createProgressStore, type DeviceProgress } from '../../modules/study/engine/progress-store'

/**
 * Chinese progress on this device: the shared flashcard engine bound to the
 * Chinese storage key, plus the offline copy of the Chinese catalogue.
 */
export type { DailyStudyActivity, DeviceCard, DeviceProgress, Rating, RemoteStudyProgress, StudySyncChange, VocabularySyncChange } from '../../modules/study/engine/progress-store'
export { mergeRemoteStudyProgress, newCardsIntroducedToday, nextReview, pendingStudyChanges, pendingVocabularyChanges, queueCompleteStudyState, recordCardPresentation, recordStudyActivity, setCardLearned, setVocabularyLearned, unsetVocabularyLearned } from '../../modules/study/engine/progress-store'
export type OfflineVocabulary = { id: string; hanzi: string; pinyin: string; english: string; portuguese: string; hsk_level: string; visual_kind?: 'emoji' | 'svg' | 'image' | null; visual_value?: string | null }

export const chineseProgressStore = createProgressStore({ storageKey: 'niorb:chinese-progress:v1', changeEvent: 'niorb:chinese-progress' })
const vocabularyStorageKey = 'niorb:chinese-vocabulary:v1'
export const chineseVocabularyEvent = 'niorb:chinese-vocabulary'

export function loadDeviceProgress() { return chineseProgressStore.load() }
export function saveDeviceProgress(progress: DeviceProgress) { chineseProgressStore.save(progress) }
export const acknowledgeStudyChanges = chineseProgressStore.acknowledgeStudyChanges
export const acknowledgeVocabularyChanges = chineseProgressStore.acknowledgeVocabularyChanges
export const createCard = chineseProgressStore.createCard
export const createCardsForVocabulary = chineseProgressStore.createCardsForVocabulary
export const rateCard = chineseProgressStore.rateCard
export const removeCard = chineseProgressStore.removeCard

function isOfflineVocabulary(value: unknown): value is OfflineVocabulary { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return ['id', 'hanzi', 'pinyin', 'english', 'portuguese', 'hsk_level'].every((field) => typeof item[field] === 'string') }
export function loadOfflineVocabulary(): OfflineVocabulary[] { try { const parsed = JSON.parse(window.localStorage.getItem(vocabularyStorageKey) ?? ''); return Array.isArray(parsed) ? parsed.filter(isOfflineVocabulary) : [] } catch { return [] } }
export function saveOfflineVocabulary(vocabulary: OfflineVocabulary[]) { window.localStorage.setItem(vocabularyStorageKey, JSON.stringify(vocabulary.filter(isOfflineVocabulary))); window.dispatchEvent(new Event(chineseVocabularyEvent)) }

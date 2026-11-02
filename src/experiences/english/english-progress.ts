import { createProgressStore, importCards, nextReview, setVocabularyLearned, type DeviceCard } from '../../modules/study/engine/progress-store'
import { createStudySync } from '../../modules/study/engine/study-sync'

/** English flashcards on the shared engine, synced with the English database. */
export const englishProgressStore = createProgressStore({ storageKey: 'niorb:english-flashcards:v1', changeEvent: 'niorb:english-flashcards' })
export const englishStudySync = createStudySync(englishProgressStore, '/api/english/study/progress')

/**
 * Counters of the English workspace before the shared engine (writing, quiz,
 * reviews). `cards` and `learned` are the old flashcard lists: read once by
 * the migration below and never written again, so they stay as a backup.
 */
export type LegacyEnglishProgress = { cards: string[]; learned: string[]; reviews: number; spelling: number; quizCorrect: number; quizAttempts: number }
export const legacyProgressKey = 'niorb:english:progress:v1'
const migratedKey = 'niorb:english-flashcards:migrated'

function ids(value: unknown) { return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [] }
function count(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }

export function loadLegacyProgress(): LegacyEnglishProgress {
  try {
    const stored = JSON.parse(window.localStorage.getItem(legacyProgressKey) ?? '{}') as Partial<Record<keyof LegacyEnglishProgress, unknown>>
    return { cards: ids(stored.cards), learned: ids(stored.learned), reviews: count(stored.reviews), spelling: count(stored.spelling), quizCorrect: count(stored.quizCorrect), quizAttempts: count(stored.quizAttempts) }
  } catch { return { cards: [], learned: [], reviews: 0, spelling: 0, quizCorrect: 0, quizAttempts: 0 } }
}
export function saveLegacyProgress(progress: LegacyEnglishProgress) { window.localStorage.setItem(legacyProgressKey, JSON.stringify(progress)) }

/**
 * Brings the old English flashcards into the engine, once per device. The old
 * screen kept no schedule, only which words were seen and which were answered
 * "Normal"/"Fácil" (learned), so:
 * - a learned word stays learned and is scheduled as after a "Normal" answer;
 * - a word seen but not learned is due for review now.
 * Cards the engine already has (synced from another device) are left alone.
 */
export function migrateLegacyEnglishProgress() {
  if (window.localStorage.getItem(migratedKey)) return 0
  const legacy = loadLegacyProgress()
  const progress = englishProgressStore.load()
  const learned = new Set(legacy.learned)
  const now = Date.now()
  // Learned first, so the queued cards carry the learned flag to the server.
  for (const id of learned) if (progress.vocabulary[id] !== 'learned') setVocabularyLearned(progress, id)
  const cards: DeviceCard[] = [...new Set([...legacy.cards, ...legacy.learned])].map((vocabularyId) => learned.has(vocabularyId)
    ? { vocabularyId, ...nextReview({ intervalDays: 0, ease: 2.5, isNew: true }, 'good'), isNew: false, updatedAt: now }
    : { vocabularyId, dueAt: new Date(now).toISOString(), intervalDays: 0, ease: 2.5, isNew: false, updatedAt: now })
  const added = importCards(progress, cards)
  if (added || learned.size) englishProgressStore.save(progress)
  window.localStorage.setItem(migratedKey, String(now))
  return added
}

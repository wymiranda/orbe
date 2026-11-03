import { useEffect, useState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import type { FlashcardSource } from '../../modules/study/flashcard-source'
import { dailyNewCardLimit } from '../../modules/study/engine/deck-session'
import { createProgressStore, newCardsIntroducedToday } from '../../modules/study/engine/progress-store'
import { toListeningSentence } from './listening-source'
import { speakChinese } from './speech'

/*
 * Sentences saved from the games ("Construam uma frase", "Ouça e monte") to study later as
 * flashcards (Flashcards → Estudar frases). Which sentences are saved is kept on the server for
 * the learner, and cached here for offline use; their flashcard progress is a deck of its own.
 */

const cacheKey = 'niorb:chinese:saved-sentences:v1'
const sentencesCacheKey = 'niorb:chinese:saved-sentence-cards:v1'
export const savedSentencesEvent = 'niorb:chinese-saved-sentences'
export const sentenceProgressStore = createProgressStore({ storageKey: 'niorb:chinese-sentence-progress:v1', changeEvent: 'niorb:chinese-sentence-progress' })

export type SentenceCard = { id: string; text: string; reading: string | null; translation: string; hsk_level: string }
type CatalogueSentence = { id: string; level: string; difficulty: 'easy' | 'medium' | 'hard' | 'brutal'; tokens: string[]; translation?: string }

function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(window.localStorage.getItem(key) ?? '') as T } catch { return fallback } }
export function savedSentenceIds(): string[] { const ids = readJson<unknown>(cacheKey, []); return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [] }
function storeIds(ids: string[]) { window.localStorage.setItem(cacheKey, JSON.stringify(ids)); window.dispatchEvent(new Event(savedSentencesEvent)) }

/** Brings the saved list from the server (another device may have changed it). */
export async function refreshSavedSentences() {
  const response = await fetch('/api/chinese/saved-sentences')
  if (!response.ok) return savedSentenceIds()
  const { ids } = await response.json() as { ids: string[] }
  storeIds(ids)
  return ids
}

/** Saves or forgets a sentence at once on the device; the server follows, and a failure undoes it. */
export async function setSentenceSaved(id: string, saved: boolean) {
  const before = savedSentenceIds()
  storeIds(saved ? [...new Set([...before, id])] : before.filter((item) => item !== id))
  try {
    const response = await fetch(`/api/chinese/saved-sentences/${encodeURIComponent(id)}`, { method: saved ? 'PUT' : 'DELETE' })
    if (!response.ok) throw new Error('saved-sentence')
  } catch { storeIds(before) }
}

function useSavedSentenceIds() {
  const [ids, setIds] = useState(savedSentenceIds)
  useEffect(() => {
    const refresh = () => setIds(savedSentenceIds())
    window.addEventListener(savedSentencesEvent, refresh)
    return () => window.removeEventListener(savedSentencesEvent, refresh)
  }, [])
  return ids
}

/** Whether a saved sentence can be studied now: a new one (within the day's new cards) or one due. */
function sentencesToStudy(ids: string[]) {
  const progress = sentenceProgressStore.load()
  const now = new Date().toISOString()
  const cards = new Map(progress.cards.map((card) => [card.vocabularyId, card]))
  const newAllowed = newCardsIntroducedToday(progress) < dailyNewCardLimit
  return ids.some((id) => { const card = cards.get(id); return !card || card.isNew ? newAllowed : card.dueAt <= now })
}

/** "Estudar frases", beside the words' study button: opens the study of the saved sentences at once. */
export function StudySentencesButton({ onStudy }: { onStudy: () => void }) {
  const ids = useSavedSentenceIds()
  const [, setTick] = useState(0)
  useEffect(() => {
    const refresh = () => setTick((tick) => tick + 1)
    window.addEventListener(sentenceProgressStore.changeEvent, refresh)
    return () => window.removeEventListener(sentenceProgressStore.changeEvent, refresh)
  }, [])
  return <button type="button" className="secondary" onClick={onStudy} disabled={!sentencesToStudy(ids)}>Estudar frases <span aria-hidden="true">→</span></button>
}

/** Small bookmark in a corner of a sentence game: marks the sentence to study later. */
export function SaveSentenceButton({ sentenceId }: { sentenceId: string }) {
  const saved = useSavedSentenceIds().includes(sentenceId)
  const Icon = saved ? BookmarkCheck : Bookmark
  return <button type="button" className={saved ? 'save-sentence saved' : 'save-sentence'} aria-pressed={saved} aria-label={saved ? 'Frase salva para estudar depois' : 'Salvar frase para estudar depois'} title={saved ? 'Frase salva para estudar depois' : 'Salvar frase para estudar depois'} onClick={() => void setSentenceSaved(sentenceId, !saved)}>
    <Icon aria-hidden="true" size={18} strokeWidth={2} />
  </button>
}

/** The saved sentences as flashcards: text, pinyin built from the vocabulary, translation. */
async function loadSentenceCards(): Promise<SentenceCard[]> {
  const [ids, sentences, vocabulary] = await Promise.all([
    refreshSavedSentences(),
    fetch('/api/chinese/sentences').then(async (response) => { if (!response.ok) throw new Error('Não foi possível carregar as frases.'); return await response.json() as CatalogueSentence[] }),
    fetch('/api/chinese/vocabulary').then(async (response) => response.ok ? await response.json() as { hanzi: string; pinyin: string }[] : []).catch(() => []),
  ])
  const pinyin = new Map(vocabulary.map((term) => [term.hanzi, term.pinyin]))
  const byId = new Map(sentences.map((sentence) => [sentence.id, sentence]))
  const cards = ids.flatMap((id): SentenceCard[] => {
    const sentence = byId.get(id)
    if (!sentence) return []
    const spoken = toListeningSentence(sentence, pinyin)
    return [{ id, text: spoken.text, reading: spoken.reading ?? null, translation: sentence.translation ?? '', hsk_level: sentence.level }]
  })
  window.localStorage.setItem(sentencesCacheKey, JSON.stringify(cards))
  // A saved sentence joins the deck as a new card.
  sentenceProgressStore.createCardsForVocabulary(sentenceProgressStore.load(), cards.map((card) => card.id))
  return cards
}

/** Flashcards of the saved sentences; `dashboardTop` leads back to the words. */
export function sentenceFlashcardSource(dashboardTop?: FlashcardSource<SentenceCard>['dashboardTop']): FlashcardSource<SentenceCard> {
  return {
    language: 'zh-Hans',
    store: sentenceProgressStore,
    loadVocabulary: loadSentenceCards,
    cachedVocabulary: () => { const cards = readJson<SentenceCard[]>(sentencesCacheKey, []); const saved = new Set(savedSentenceIds()); return Array.isArray(cards) ? cards.filter((card) => saved.has(card.id)) : [] },
    vocabularyEvent: savedSentencesEvent,
    studyLabel: 'Estudar frases',
    face: (item) => ({ front: item.text, reading: item.reading, meaning: item.translation, detail: `HSK ${item.hsk_level}`, speech: item.text, frontClassName: 'focus-sentence' }),
    speak: speakChinese,
    dashboardTop,
  }
}

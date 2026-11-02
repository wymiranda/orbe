import type { FlashcardSource } from '../../modules/study/flashcard-source'
import { chineseProgressStore, chineseVocabularyEvent, loadOfflineVocabulary, saveOfflineVocabulary, type OfflineVocabulary } from './device-progress'
import { HskBulkAdd, StudyOptions } from './workspace/flashcard-dashboard'
import { NewWordsWall } from './workspace/session-summary'
import { wordExplanations } from './word-explanations'

function speakChinese(text: string) {
  if (!('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'; utterance.rate = 0.8
  window.speechSynthesis.speak(utterance)
  return true
}

/** Chinese words on the shared flashcard engine; `wallLevel` is the HSK wall the new cards fly to at the end of a deck study. */
export function chineseFlashcardSource(wallLevel?: string, dashboardTop?: FlashcardSource<OfflineVocabulary>['dashboardTop']): FlashcardSource<OfflineVocabulary> {
  return {
    language: 'zh-Hans',
    store: chineseProgressStore,
    loadVocabulary: async () => {
      const response = await fetch('/api/chinese/vocabulary')
      if (!response.ok) throw new Error('Não foi possível atualizar o catálogo.')
      const catalogue = await response.json() as OfflineVocabulary[]
      saveOfflineVocabulary(catalogue)
      return catalogue
    },
    cachedVocabulary: () => loadOfflineVocabulary(),
    vocabularyEvent: chineseVocabularyEvent,
    face: (item) => ({ front: item.hanzi, reading: item.pinyin, meaning: item.portuguese, detail: `${item.english} · HSK ${item.hsk_level}`, speech: item.hanzi, explanation: wordExplanations[item.hanzi] ?? null, visual: item.visual_kind && item.visual_value ? { kind: item.visual_kind, value: item.visual_value } : null }),
    speak: speakChinese,
    dashboardTop,
    dashboardBottom: (context) => <><HskBulkAdd {...context} /><StudyOptions {...context} /></>,
    sessionComplete: wallLevel ? (introduced, vocabulary) => <NewWordsWall newWords={introduced} level={wallLevel} vocabulary={vocabulary} /> : undefined,
  }
}

import type { SpeakingItem, SpeakingSource } from '../../modules/speak-aloud/SpeakAloudModule'
import { toListeningSentence } from './listening-source'
import { speakChinese } from './speech'
import { choosableDifficulties, sessionHskLevels, studyDifficultyLabels, type StudyDifficulty } from './study-difficulty'

/** Contracts of GET /api/chinese/sentences and GET /api/chinese/vocabulary. */
type ChineseSentence = { id: string; level: string; difficulty: StudyDifficulty; tokens: string[]; translation?: string }
type ChineseTerm = { id: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string }

async function loadJson<T>(path: string, failure: string) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(failure)
  return await response.json() as T
}

/**
 * Builds the source for "Solte a Voz" in Mandarin: words or sentences of
 * exactly the chosen HSK level and (for sentences) difficulty, from the whole
 * catalogue, whatever the learner has studied. The recognizer always listens
 * in Mandarin (zh-CN), whatever the interface language. Brutal is offered
 * only when `brutalUnlocked`.
 */
export function createChineseSpeakingSource({ initial }: { initial: { level: string; difficulty: StudyDifficulty; brutalUnlocked: boolean } }): SpeakingSource {
  return {
    language: 'zh-Hans',
    recognitionLanguage: 'zh-CN',
    segmentation: 'characters',
    label: 'Mandarim',
    intro: 'Fale em voz alta a palavra ou a frase que aparece na tela.',
    filters: [
      { id: 'kind', label: 'Praticar', initial: 'words', options: [{ value: 'words', label: 'Palavras' }, { value: 'sentences', label: 'Frases' }] },
      { id: 'level', label: 'Nível HSK', initial: initial.level, options: sessionHskLevels.map((level) => ({ value: level, label: `HSK ${level}` })) },
      // Words have no difficulty: the choice only applies to sentences.
      { id: 'difficulty', label: 'Dificuldade', initial: initial.difficulty, visibleWhen: { id: 'kind', value: 'sentences' }, options: choosableDifficulties(initial.brutalUnlocked).map((difficulty) => ({ value: difficulty, label: studyDifficultyLabels[difficulty] })) },
    ],
    async loadItems(selection) {
      const level = Number(selection.level) || 1
      const vocabulary = await loadJson<ChineseTerm[]>('/api/chinese/vocabulary', 'Não foi possível carregar o vocabulário.')
      if (selection.kind !== 'sentences')
        return vocabulary.filter((term) => Number(term.hsk_level) === level).map((term): SpeakingItem => ({ id: term.id, text: term.hanzi, reading: term.pinyin, meaning: term.portuguese, contentIds: [term.id] }))
      const difficulty = (selection.difficulty as StudyDifficulty | undefined) ?? 'easy'
      const sentences = await loadJson<ChineseSentence[]>('/api/chinese/sentences', 'Não foi possível carregar as frases.')
      const pinyin = new Map(vocabulary.map((term) => [term.hanzi, term.pinyin]))
      return sentences
        .filter((sentence) => Number(sentence.level) === level && sentence.difficulty === difficulty)
        .map((sentence): SpeakingItem => {
          const spoken = toListeningSentence(sentence, pinyin)
          return { id: sentence.id, text: spoken.text, reading: spoken.reading, meaning: sentence.translation, contentIds: spoken.contentIds }
        })
    },
    speak: (text) => { speakChinese(text) },
  }
}

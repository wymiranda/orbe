import type { ListeningSentence, ListeningSource } from '../../modules/listen-build/ListenBuildModule'
import { chineseVoiceStatus, speakChinese } from './speech'
import { choosableDifficulties, sessionHskLevels, studyDifficultyLabels, withinDifficulty, type StudyDifficulty } from './study-difficulty'

/** Contract of GET /api/chinese/sentences (owned by worker/modules/chinese/sentence-corpus.ts). */
type ChineseSentence = { id: string; level: string; difficulty: 'easy' | 'medium' | 'hard' | 'brutal'; tokens: string[] }
type VocabularyReading = { hanzi: string; pinyin: string }

const punctuation = new Set(['。', '？', '！', '，'])
const readingPunctuation: Record<string, string> = { '。': '.', '？': '?', '！': '!', '，': ',' }

/** Same ID format as the learning-path catalogue (`zh-hans:sentence:我喝茶`). */
export function sentenceContentId(tokens: string[]) { return `zh-hans:sentence:${tokens.filter((token) => !punctuation.has(token)).join('')}` }

export function toListeningSentence(sentence: ChineseSentence, pinyin: Map<string, string>): ListeningSentence {
  const words = sentence.tokens.filter((token) => !punctuation.has(token))
  const readings = sentence.tokens.map((token) => readingPunctuation[token] ?? pinyin.get(token))
  // A partial reading would teach a wrong pronunciation: it is shown only when complete.
  const reading = readings.every(Boolean) ? readings.join(' ').replace(/ ([.?!,])/g, '$1') : undefined
  return { id: sentence.id, tokens: words, text: sentence.tokens.join(''), reading, contentIds: [sentenceContentId(sentence.tokens), ...new Set(words)] }
}

async function loadJson<T>(path: string, failure: string) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(failure)
  return await response.json() as T
}

/**
 * Keeps sentences made of words the learner has already studied.
 * - strict (daily session): only those sentences.
 * - otherwise (Jogos catalogue): those first; when there are fewer than
 *   `minimum`, sentences with a single new word complete the list after them.
 */
export function preferStudiedSentences(sentences: ListeningSentence[], studied: (hanzi: string) => boolean, { strict = false, minimum = 5 } = {}) {
  const newWords = (sentence: ListeningSentence) => sentence.tokens.filter((token) => !studied(token)).length
  const known = sentences.filter((sentence) => newWords(sentence) === 0).map((sentence) => ({ ...sentence, priority: 0 }))
  if (strict || known.length >= minimum) return known
  return [...known, ...sentences.filter((sentence) => newWords(sentence) === 1).map((sentence) => ({ ...sentence, priority: 1 }))]
}

/**
 * Builds the source for "Ouça e monte".
 * - `maxLevel` limits the HSK level of the sentences offered.
 * - `maxDifficulty` limits their difficulty (the chosen one and easier ones).
 * - `studiedWord` tells which words the learner has already studied; see preferStudiedSentences.
 * - `choosable` (Jogos catalogue) lets the learner pick the level and the difficulty on the setup
 *   screen, starting from the given values, and plays exactly that part of the catalogue
 *   (HSK 2 · Fácil is only HSK 2 Fácil sentences), whatever the learner has studied.
 *   Brutal is offered only when `brutalUnlocked`.
 */
export function createChineseListeningSource({ maxLevel = 2, maxDifficulty, studiedWord, strict = false, choosable }: { maxLevel?: number; maxDifficulty?: StudyDifficulty; studiedWord?: (hanzi: string) => boolean; strict?: boolean; choosable?: { level: string; difficulty: StudyDifficulty; brutalUnlocked: boolean } } = {}): ListeningSource {
  return {
    language: 'zh-Hans',
    label: 'Mandarim',
    intro: 'Ouça a frase em chinês e monte com as cartas certas.',
    missingVoiceMessage: 'Este aparelho não tem uma voz em chinês instalada. Instale uma nas configurações de texto para fala para jogar.',
    filters: choosable && [
      { id: 'level', label: 'Nível HSK', initial: choosable.level, options: sessionHskLevels.map((level) => ({ value: level, label: `HSK ${level}` })) },
      { id: 'difficulty', label: 'Dificuldade', initial: choosable.difficulty, options: choosableDifficulties(choosable.brutalUnlocked).map((difficulty) => ({ value: difficulty, label: studyDifficultyLabels[difficulty] })) },
    ],
    async loadSentences(selection) {
      const level = Number(selection?.level) || maxLevel
      const difficulty = (selection?.difficulty as StudyDifficulty | undefined) ?? maxDifficulty
      const [sentences, vocabulary] = await Promise.all([
        loadJson<ChineseSentence[]>('/api/chinese/sentences', 'Não foi possível carregar as frases.'),
        loadJson<VocabularyReading[]>('/api/chinese/vocabulary', 'Não foi possível carregar o vocabulário.').catch(() => []),
      ])
      const pinyin = new Map(vocabulary.map((term) => [term.hanzi, term.pinyin]))
      const offered = sentences
        .filter((sentence) => choosable
          ? Number(sentence.level) === level && sentence.difficulty === difficulty
          : Number(sentence.level) <= level && (!difficulty || withinDifficulty(sentence.difficulty, difficulty)))
        .map((sentence) => toListeningSentence(sentence, pinyin))
      return studiedWord && !choosable ? preferStudiedSentences(offered, studiedWord, { strict }) : offered
    },
    async loadBrutalSentences() {
      const [sentences, vocabulary] = await Promise.all([
        loadJson<ChineseSentence[]>('/api/chinese/sentences', 'Não foi possível carregar as frases.'),
        loadJson<VocabularyReading[]>('/api/chinese/vocabulary', 'Não foi possível carregar o vocabulário.').catch(() => []),
      ])
      const pinyin = new Map(vocabulary.map((term) => [term.hanzi, term.pinyin]))
      return sentences
        .filter((sentence) => Number(sentence.level) <= maxLevel && sentence.difficulty === 'brutal')
        .map((sentence) => toListeningSentence(sentence, pinyin))
    },
    voiceStatus: () => chineseVoiceStatus(),
    speak: (text) => { speakChinese(text) },
  }
}

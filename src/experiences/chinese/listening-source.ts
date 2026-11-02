import type { ListeningSentence, ListeningSource } from '../../modules/listen-build/ListenBuildModule'
import { chineseVoiceStatus, speakChinese } from './speech'
import { choosableDifficulties, sessionHskLevels, studyDifficultyLabels, withinDifficulty, type StudyDifficulty } from './study-difficulty'

/** Contract of GET /api/chinese/sentences (owned by worker/modules/chinese/sentence-corpus.ts). */
type ChineseSentence = { id: string; level: string; difficulty: 'easy' | 'medium' | 'hard' | 'brutal'; tokens: string[] }
type VocabularyReading = { hanzi: string; pinyin: string }

const punctuation = new Set(['。', '？', '！', '，'])
/** Chance of a surprise Brutal round per game, by the difficulty being played; none while playing Brutal itself. */
const brutalSurpriseChances: Record<StudyDifficulty, number> = { easy: .001, medium: .003, hard: .01, brutal: 0 }
/** On Difícil, for a learner above 85% in each of their last five Difícil sessions. */
const boostedBrutalSurpriseChance = .05
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
 *   (HSK 2 · Fácil is only HSK 2 Fácil sentences); with `studiedWord`, only its sentences whose
 *   words the learner has all learned, except on Brutal.
 *   Brutal is offered only at the HSK levels of `brutalLevels`.
 * - `focusWords` (daily session): sentences with one of these words (its new words) are played first,
 *   and those `playedLately` last.
 * - `brutalBoost`: surprise Brutal rounds are more frequent on Difícil (see brutalSurpriseChances).
 * - `onBrutalCorrect` receives the ID of each surprise Brutal sentence answered correctly.
 */
export function createChineseListeningSource({ maxLevel = 2, maxDifficulty, studiedWord, strict = false, choosable, focusWords = [], playedLately = () => false, brutalBoost = false, onBrutalCorrect }: { maxLevel?: number; maxDifficulty?: StudyDifficulty; studiedWord?: (hanzi: string) => boolean; strict?: boolean; focusWords?: string[]; playedLately?: (sentence: ListeningSentence) => boolean; brutalBoost?: boolean; choosable?: { level: string; difficulty: StudyDifficulty; brutalLevels: string[] }; onBrutalCorrect?: (sentenceId: string) => void } = {}): ListeningSource {
  return {
    language: 'zh-Hans',
    label: 'Mandarim',
    intro: 'Ouça a frase em chinês e monte com as cartas certas.',
    missingVoiceMessage: 'Este aparelho não tem uma voz em chinês instalada. Instale uma nas configurações de texto para fala para jogar.',
    filters: choosable && [
      { id: 'level', label: 'Nível HSK', initial: choosable.level, options: sessionHskLevels.map((level) => ({ value: level, label: `HSK ${level}` })) },
      { id: 'difficulty', label: 'Dificuldade', initial: choosable.difficulty, options: choosableDifficulties(true).map((difficulty) => ({ value: difficulty, label: studyDifficultyLabels[difficulty], ...(difficulty === 'brutal' ? { visibleWhen: { id: 'level', values: choosable.brutalLevels } } : {}) })) },
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
      // Brutal is the one exception: its sentences may hold words not learned yet.
      const preferred = studiedWord && difficulty !== 'brutal' ? preferStudiedSentences(offered, studiedWord, { strict: strict || Boolean(choosable) }) : offered
      return preferred.map((sentence) => {
        const priority = (sentence.priority ?? 0) - (sentence.tokens.some((token) => focusWords.includes(token)) ? 2 : 0) + (playedLately(sentence) ? 1 : 0)
        return priority === (sentence.priority ?? 0) ? sentence : { ...sentence, priority }
      })
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
    brutalSurpriseChance: (selection) => {
      const playing = ((choosable ? selection.difficulty : maxDifficulty) as StudyDifficulty | undefined) ?? 'easy'
      return playing === 'hard' && brutalBoost ? boostedBrutalSurpriseChance : brutalSurpriseChances[playing] ?? 0
    },
    onBrutalCorrect: (sentence) => onBrutalCorrect?.(sentence.id),
    voiceStatus: () => chineseVoiceStatus(),
    speak: (text) => { speakChinese(text) },
  }
}

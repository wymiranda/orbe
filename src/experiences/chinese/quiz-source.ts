import type { QuizQuestion, QuizSet, QuizSource } from '../../modules/quiz/QuizModule'
import { recordModuleActivity } from '../../learning-paths/module-bridge'
import { sentenceContentId } from './listening-source'

type ChineseVocabulary = { id: string; type: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string }
type StoredQuizQuestion = { id: string; hsk_level: string; mode: 'recognition' | 'hsk-mock'; question_type: 'single_choice' | 'fill_blank'; prompt: string; choices: { id: string; text: string }[]; answer_id: string }
type ChineseSentence = { id: string; level: string; difficulty: 'easy' | 'medium' | 'hard' | 'brutal'; tokens: string[]; translation?: string }

const punctuation = new Set(['。', '？', '！', '，', '、'])

function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[randomIndex]] = [result[randomIndex], result[index]]
  }
  return result
}

async function loadVocabulary() {
  const response = await fetch('/api/chinese/vocabulary')
  if (!response.ok) throw new Error('Não foi possível carregar o catálogo de vocabulário.')
  const vocabulary = await response.json() as ChineseVocabulary[]
  return vocabulary.filter((item) => /^\p{Script=Han}+$/u.test(item.hanzi))
}

async function loadCustomQuestions(setId: string, modeId: string) {
  const response = await fetch(`/api/chinese/quiz-questions?level=${encodeURIComponent(setId)}&mode=${encodeURIComponent(modeId)}`)
  if (!response.ok) throw new Error('Não foi possível carregar as questões cadastradas.')
  return response.json() as Promise<StoredQuizQuestion[]>
}

async function loadSentences() {
  const response = await fetch('/api/chinese/sentences')
  if (!response.ok) throw new Error('Não foi possível carregar as frases.')
  return response.json() as Promise<ChineseSentence[]>
}

function sentenceContentIds(sentence: ChineseSentence) {
  const words = sentence.tokens.filter((token) => !punctuation.has(token))
  return [sentenceContentId(sentence.tokens), ...new Set(words)]
}

function sentenceQuestions(sentences: ChineseSentence[]): QuizQuestion[] {
  return sentences.map((sentence, index) => {
    const contentIds = sentenceContentIds(sentence)
    if (index % 2 === 0) {
      const tokens = sentence.tokens.filter((token) => !punctuation.has(token)).map((text, tokenIndex) => ({ id: `${sentence.id}:${tokenIndex}`, text }))
      return { id: `${sentence.id}:ordering`, type: 'ordering' as const, prompt: { text: 'Monte a frase.' }, tokens: shuffle(tokens), answer: tokens.map((token) => token.id), contentIds }
    }
    const distractors = shuffle(sentences.filter((candidate) => candidate.id !== sentence.id && candidate.translation !== sentence.translation))
      .filter((candidate, candidateIndex, candidates) => candidates.findIndex((item) => item.translation === candidate.translation) === candidateIndex)
      .slice(0, 3)
    const choices = shuffle([
      { id: sentence.id, text: sentence.translation! },
      ...distractors.map((candidate) => ({ id: candidate.id, text: candidate.translation! })),
    ])
    return { id: `${sentence.id}:meaning`, type: 'single_choice' as const, prompt: { text: sentence.tokens.join('') }, choices, answer: sentence.id, contentIds }
  })
}

export const chineseQuizSource: QuizSource = {
  id: 'chinese-vocabulary',
  title: 'Pratique seu vocabulário HSK',
  description: 'Escolha uma prática e o nível que deseja revisar. Seus resultados ficam apenas neste dispositivo.',
  onActivityResult: (result) => { void recordModuleActivity(result) },
  modes: [
    { id: 'recognition', label: 'Reconhecimento', description: 'Veja o hanzi e escolha seu significado.' },
    { id: 'hsk-mock', label: 'Simulado HSK', description: 'Pratique vocabulário em formatos alternados de prova.' },
    { id: 'sentences', label: 'Frases', description: 'Monte e interprete frases naturais.' },
  ],
  async loadSets(): Promise<QuizSet[]> {
    const vocabulary = await loadVocabulary()
    return [...new Set(vocabulary.map((item) => item.hsk_level))].sort((first, second) => Number(first) - Number(second)).map((level) => {
      const total = vocabulary.filter((item) => item.hsk_level === level).length
      return { id: level, label: `HSK ${level}`, description: `${total} termos` }
    })
  },
  async createSession(setId, count, modeId = 'recognition') {
    if (modeId === 'sentences') {
      const sentencePool = (await loadSentences()).filter((sentence) => Number(sentence.level) <= Number(setId) && sentence.difficulty !== 'brutal' && Boolean(sentence.translation) && sentence.tokens.filter((token) => !punctuation.has(token)).length >= 2)
      const questions = sentenceQuestions(shuffle(sentencePool).slice(0, count))
      return { id: `hsk-${setId}-sentences`, title: `HSK ${setId} · Frases`, description: 'Frases naturais do catálogo curado.', questions }
    }
    const customQuestions = await loadCustomQuestions(setId, modeId)
    if (customQuestions.length) {
      const questions: QuizQuestion[] = shuffle(customQuestions).slice(0, count).map((question) => ({ id: question.id, type: question.question_type, prompt: { text: question.prompt }, choices: question.choices, answer: question.answer_id }))
      return { id: `hsk-${setId}-${modeId}-custom`, title: `HSK ${setId} · ${modeId === 'hsk-mock' ? 'Simulado' : 'Reconhecimento'}`, description: 'Questões preparadas pela curadoria.', questions }
    }
    const vocabulary = (await loadVocabulary()).filter((item) => item.hsk_level === setId)
    if (vocabulary.length < 4) return { id: `hsk-${setId}`, title: `HSK ${setId}`, questions: [] }
    const isMock = modeId === 'hsk-mock'
    const questions: QuizQuestion[] = shuffle(vocabulary).slice(0, Math.min(count, vocabulary.length)).map((item, index) => {
      const candidates = shuffle(vocabulary.filter((candidate) => candidate.id !== item.id && (isMock && index % 2 ? candidate.hanzi !== item.hanzi : candidate.portuguese !== item.portuguese))).slice(0, 3)
      const reverseQuestion = isMock && index % 2 === 1
      const choices = shuffle([{ id: item.id, text: reverseQuestion ? `${item.hanzi} · ${item.pinyin}` : item.portuguese }, ...candidates.map((candidate, candidateIndex) => ({ id: `distractor-${candidateIndex}`, text: reverseQuestion ? `${candidate.hanzi} · ${candidate.pinyin}` : candidate.portuguese }))])
      return { id: item.id, contentIds: [item.id], type: 'single_choice' as const, prompt: { text: reverseQuestion ? `Qual termo corresponde a “${item.portuguese}”?` : item.hanzi }, answer: item.id, choices }
    }).filter((question) => question.choices?.length === 4)
    return isMock
      ? { id: `hsk-${setId}-mock`, title: `HSK ${setId} · Simulado`, description: 'Simulado de vocabulário para prática; não equivale à prova oficial HSK.', questions }
      : { id: `hsk-${setId}`, title: `HSK ${setId} · Reconhecimento`, description: 'Escolha o significado correto para cada termo.', questions }
  },
}
